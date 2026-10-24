// Appels à l'API Claude : transcription des règles et réponses aux questions.
import Anthropic from '@anthropic-ai/sdk';

const MODEL_IMPORT = process.env.MODEL_IMPORT || 'claude-sonnet-5-5';
const MODEL_ASK = process.env.MODEL_ASK || 'claude-sonnet-5-5';
const MOCK = process.env.MOCK_AI === '1';

let client;
function getClient() {
  if (!client) {
    // Tolère les erreurs de copier-coller courantes : espaces, retours à la ligne, guillemets.
    const apiKey = String(process.env.ANTHROPIC_API_KEY || '').replace(/[\s"'`]/g, '');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant');
    client = new Anthropic({ apiKey });
  }
  return client;
}

function textOf(message) {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// ---------------------------------------------------------------- Import

const IMPORT_SYSTEM = `Tu transcris des livrets de règles de jeux de société (photos ou PDF) en texte propre, en français.

Règles de travail :
- Retranscris FIDÈLEMENT toutes les règles : chiffres, exceptions, cas particuliers, exemples utiles. Ne résume pas, n'invente rien.
- Si la source est dans une autre langue, traduis en français en gardant les noms officiels des cartes/éléments entre parenthèses la première fois.
- Décris en une phrase les illustrations qui portent une règle (ex : schéma de mise en place).
- Si un passage est illisible ou coupé, écris [illisible] à cet endroit plutôt que de deviner.
- Ignore les crédits, publicités et mentions légales.

Structure la sortie en Markdown avec ces sections quand elles existent (titres de niveau 2) :
## Aperçu et but du jeu
## Matériel
## Mise en place
## Déroulement d'un tour
## Actions et mécaniques
## Fin de partie et décompte
## Variantes et règles avancées
## Cas particuliers et précisions

Commence ta réponse EXACTEMENT par ces trois lignes, puis une ligne "---", puis le Markdown :
NOM: <nom du jeu>
JOUEURS: <ex. 2-4 joueurs, ou ?>
DUREE: <ex. 45 min, ou ?>`;

function parseImport(raw) {
  const meta = { name: null, players: null, duration: null };
  let body = raw;
  const sep = raw.indexOf('\n---');
  if (sep !== -1) {
    const head = raw.slice(0, sep);
    body = raw.slice(sep + 4).trim();
    for (const line of head.split('\n')) {
      const m = line.match(/^\s*(NOM|JOUEURS|DUREE)\s*:\s*(.+)$/i);
      if (!m) continue;
      const v = m[2].trim();
      if (v === '?' || v === '') continue;
      if (/^NOM$/i.test(m[1])) meta.name = v;
      if (/^JOUEURS$/i.test(m[1])) meta.players = v;
      if (/^DUREE$/i.test(m[1])) meta.duration = v;
    }
  }
  return { ...meta, rules_md: body };
}

/**
 * files: [{ buffer, mimetype }] — images (jpeg/png/webp/gif) ou PDF.
 * existingRules: texte déjà enregistré (import en plusieurs fois) ou null.
 */
export async function transcribeRules(files, { hintName, existingRules } = {}) {
  if (MOCK) {
    return parseImport(
      `NOM: ${hintName || 'Jeu de test'}\nJOUEURS: 2-4 joueurs\nDUREE: 30 min\n---\n## Mise en place\nChaque joueur prend 5 cartes.\n\n## Fin de partie et décompte\nLe premier à 10 points gagne.`
    );
  }

  const content = [];
  for (const f of files) {
    const data = f.buffer.toString('base64');
    if (f.mimetype === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: f.mimetype, data } });
    }
  }

  let instruction = 'Transcris les règles contenues dans ces pages.';
  if (hintName) instruction += ` Le jeu s'appelle « ${hintName} ».`;
  if (existingRules) {
    instruction +=
      "\n\nCes pages COMPLÈTENT des règles déjà transcrites (ci-dessous). Produis la version COMPLÈTE fusionnée : garde tout l'existant, intègre les nouvelles pages au bon endroit, sans doublons.\n\n<regles_existantes>\n" +
      existingRules +
      '\n</regles_existantes>';
  }
  content.push({ type: 'text', text: instruction });

  const stream = getClient().messages.stream({
    model: MODEL_IMPORT,
    max_tokens: 32000,
    system: IMPORT_SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const message = await stream.finalMessage();
  const raw = textOf(message);
  if (!raw) throw new Error("L'IA n'a renvoyé aucun texte");
  const parsed = parseImport(raw);
  if (message.stop_reason === 'max_tokens') {
    parsed.rules_md += '\n\n> ⚠️ Transcription tronquée (livret très long) : importe la suite en plusieurs fois.';
  }
  return parsed;
}

// ---------------------------------------------------------------- Questions

const MODES = {
  ask: null,
  resume:
    "Fais un résumé express pour reprendre ce jeu en 2 minutes : but du jeu, déroulement d'un tour, fin de partie, et les 3 règles qu'on oublie le plus souvent.",
  setup: 'Explique la mise en place pas à pas, sous forme de liste numérotée courte.',
  win: 'Comment gagne-t-on et comment se fait le décompte des points ?',
  newbie:
    "Explique ce jeu à quelqu'un qui n'y a jamais joué, simplement, sans jargon, en commençant par le but du jeu. Maximum 12 phrases.",
  turn: "Rappelle ce qu'on peut faire pendant son tour, dans l'ordre.",
};

export const MODE_LABELS = {
  resume: 'Résumé express',
  setup: 'Mise en place',
  win: 'Comment on gagne ?',
  newbie: 'Explique à un débutant',
  turn: 'Mon tour',
};

function askSystem(game) {
  return [
    {
      type: 'text',
      text: `Tu es l'arbitre des règles du jeu de société « ${game.name} », autour d'une table de jeu en famille.

Comment répondre :
- Réponds UNIQUEMENT à partir des règles et des notes maison fournies ci-dessous. N'utilise pas tes connaissances générales sur ce jeu, elles peuvent concerner une autre édition.
- Va droit au but : la réponse d'abord, en 1 à 4 phrases, puis éventuellement une précision. Les réponses sont souvent lues à voix haute.
- Termine par la source entre crochets, ex : [Règles › Fin de partie] ou [Notes maison].
- Si les règles ne tranchent pas, dis-le clairement (« Les règles ne précisent pas… »), propose l'interprétation la plus logique en la présentant comme une suggestion, et conseille de vérifier la FAQ officielle de l'éditeur.
- Si une note maison modifie une règle officielle, applique la note maison et signale-le.
- Pas de tableaux. Listes courtes autorisées.`,
    },
    {
      type: 'text',
      text: `<regles>\n${game.rules_md || '(aucune règle enregistrée)'}\n</regles>\n\n<notes_maison>\n${game.house_notes || '(aucune)'}\n</notes_maison>`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

/**
 * history: [{ question, answer }] des derniers échanges (pour les questions de suivi).
 */
export async function askRules(game, { question, mode = 'ask', history = [] }) {
  const prompt = mode !== 'ask' && MODES[mode] ? MODES[mode] : question;
  if (!prompt || !prompt.trim()) throw new Error('Question vide');

  if (MOCK) {
    return { question: prompt, answer: `Réponse simulée pour « ${prompt} ». [Règles › Mise en place]` };
  }

  const messages = [];
  for (const h of history.slice(-4)) {
    messages.push({ role: 'user', content: h.question });
    messages.push({ role: 'assistant', content: h.answer });
  }
  messages.push({ role: 'user', content: prompt });

  const message = await getClient().messages.create({
    model: MODEL_ASK,
    max_tokens: 4000,
    system: askSystem(game),
    messages,
  });
  return { question: prompt, answer: textOf(message) || "Je n'ai pas réussi à répondre, reformule ta question." };
}
