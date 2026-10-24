// GM Pocket — serveur V1 (famille)
import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, query } from './db.js';
import { requireUser, setSessionCookie, clearSessionCookie, safeEqual } from './auth.js';
import { transcribeRules, askRules, MODE_LABELS } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DAILY_QUESTIONS = Number(process.env.DAILY_QUESTION_LIMIT || 150);
const DAILY_IMPORTS = Number(process.env.DAILY_IMPORT_LIMIT || 20);
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_TYPES.has(file.mimetype)),
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// L'appli Android (Capacitor) charge l'interface depuis https://localhost et appelle l'API
// depuis cette origine : on l'autorise explicitement. L'authentification passe par un jeton
// (en-tête Authorization), pas par cookie, donc pas besoin de « credentials ».
const APP_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost']);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function cleanName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

// Petit anti-bruteforce en mémoire sur la connexion.
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60_000);
  attempts.set(key, list);
  return list.length >= 10;
}
function recordAttempt(key) {
  attempts.set(key, [...(attempts.get(key) || []), Date.now()]);
}

// ------------------------------------------------------------- Comptes

app.post('/api/register', wrap(async (req, res) => {
  const name = cleanName(req.body.name);
  const password = String(req.body.password || '');
  const familyCode = String(req.body.familyCode || '');
  if (!process.env.FAMILY_CODE) return res.status(500).json({ error: 'FAMILY_CODE non configuré sur le serveur' });
  if (tooManyAttempts(req.ip)) return res.status(429).json({ error: 'Trop de tentatives, réessaie dans 15 minutes' });
  if (!safeEqual(familyCode, process.env.FAMILY_CODE)) {
    recordAttempt(req.ip);
    return res.status(403).json({ error: 'Code famille incorrect' });
  }
  if (name.length < 2) return res.status(400).json({ error: 'Prénom trop court' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum' });

  const exists = await query('SELECT id FROM users WHERE lower(name) = lower($1)', [name]);
  if (exists.rows.length) return res.status(409).json({ error: 'Ce prénom est déjà pris' });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query('INSERT INTO users (name, password_hash) VALUES ($1, $2) RETURNING id, name', [name, hash]);
  const token = setSessionCookie(res, rows[0].id);
  res.json({ user: rows[0], token });
}));

app.post('/api/login', wrap(async (req, res) => {
  const name = cleanName(req.body.name);
  const password = String(req.body.password || '');
  if (tooManyAttempts(req.ip)) return res.status(429).json({ error: 'Trop de tentatives, réessaie dans 15 minutes' });
  const { rows } = await query('SELECT id, name, password_hash FROM users WHERE lower(name) = lower($1)', [name]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    recordAttempt(req.ip);
    return res.status(401).json({ error: 'Prénom ou mot de passe incorrect' });
  }
  const token = setSessionCookie(res, user.id);
  res.json({ user: { id: user.id, name: user.name }, token });
}));

app.post('/api/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', requireUser, wrap(async (req, res) => {
  const { rows } = await query('SELECT id, name FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(401).json({ error: 'Connexion requise' });
  res.json({ user: rows[0], modes: MODE_LABELS });
}));

// ------------------------------------------------------------- Jeux

const GAME_FIELDS = 'id, name, players, duration, rules_md, house_notes, created_at, updated_at';

app.get('/api/games', requireUser, wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT g.id, g.name, g.players, g.duration, g.updated_at,
            (SELECT max(created_at) FROM questions q WHERE q.game_id = g.id) AS last_asked
       FROM games g ORDER BY lower(g.name)`
  );
  res.json({ games: rows });
}));

app.get('/api/games/:id', requireUser, wrap(async (req, res) => {
  const { rows } = await query(`SELECT ${GAME_FIELDS} FROM games WHERE id = $1`, [Number(req.params.id)]);
  if (!rows[0]) return res.status(404).json({ error: 'Jeu introuvable' });
  res.json({ game: rows[0] });
}));

app.post('/api/games', requireUser, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Nom du jeu requis' });
  const { rows } = await query(
    `INSERT INTO games (name, players, duration, rules_md, house_notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${GAME_FIELDS}`,
    [name, req.body.players || null, req.body.duration || null, String(req.body.rules_md || ''), String(req.body.house_notes || ''), req.userId]
  );
  res.json({ game: rows[0] });
}));

app.patch('/api/games/:id', requireUser, wrap(async (req, res) => {
  const allowed = ['name', 'players', 'duration', 'rules_md', 'house_notes'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (k in req.body) {
      vals.push(req.body[k] === null ? null : String(req.body[k]));
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Rien à modifier' });
  vals.push(Number(req.params.id));
  const { rows } = await query(
    `UPDATE games SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING ${GAME_FIELDS}`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: 'Jeu introuvable' });
  res.json({ game: rows[0] });
}));

app.delete('/api/games/:id', requireUser, wrap(async (req, res) => {
  await query('DELETE FROM games WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------- Import (photos / PDF)

app.post('/api/import', requireUser, upload.array('files', 20), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Ajoute au moins une photo ou un PDF' });
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > 30 * 1024 * 1024) return res.status(413).json({ error: 'Fichiers trop lourds (30 Mo max par import)' });

  const { rows: cnt } = await query(
    `SELECT count(*)::int AS n FROM imports WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
    [req.userId]
  );
  if (cnt[0].n >= DAILY_IMPORTS) return res.status(429).json({ error: `Limite de ${DAILY_IMPORTS} imports par jour atteinte` });

  const gameId = req.body.gameId ? Number(req.body.gameId) : null;
  let existing = null;
  if (gameId) {
    const r = await query(`SELECT ${GAME_FIELDS} FROM games WHERE id = $1`, [gameId]);
    existing = r.rows[0];
    if (!existing) return res.status(404).json({ error: 'Jeu introuvable' });
  }

  const hintName = String(req.body.name || existing?.name || '').trim() || undefined;
  const result = await transcribeRules(files, { hintName, existingRules: existing?.rules_md || null });

  let game;
  if (existing) {
    const r = await query(
      `UPDATE games SET rules_md = $1, players = COALESCE(players, $2), duration = COALESCE(duration, $3), updated_at = now()
        WHERE id = $4 RETURNING ${GAME_FIELDS}`,
      [result.rules_md, result.players, result.duration, existing.id]
    );
    game = r.rows[0];
  } else {
    const r = await query(
      `INSERT INTO games (name, players, duration, rules_md, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${GAME_FIELDS}`,
      [hintName || result.name || 'Jeu sans nom', result.players, result.duration, result.rules_md, req.userId]
    );
    game = r.rows[0];
  }
  await query('INSERT INTO imports (user_id, game_id) VALUES ($1, $2)', [req.userId, game.id]);
  res.json({ game });
}));

// ------------------------------------------------------------- Questions

app.post('/api/games/:id/ask', requireUser, wrap(async (req, res) => {
  const { rows } = await query(`SELECT ${GAME_FIELDS} FROM games WHERE id = $1`, [Number(req.params.id)]);
  const game = rows[0];
  if (!game) return res.status(404).json({ error: 'Jeu introuvable' });
  if (!game.rules_md.trim()) return res.status(400).json({ error: "Ce jeu n'a pas encore de règles : importe-les d'abord" });

  const { rows: cnt } = await query(
    `SELECT count(*)::int AS n FROM questions WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
    [req.userId]
  );
  if (cnt[0].n >= DAILY_QUESTIONS) return res.status(429).json({ error: `Limite de ${DAILY_QUESTIONS} questions par jour atteinte` });

  const mode = String(req.body.mode || 'ask');
  const question = String(req.body.question || '').slice(0, 1000);
  const history = Array.isArray(req.body.history)
    ? req.body.history
        .slice(-4)
        .filter((h) => h && typeof h.question === 'string' && typeof h.answer === 'string')
        .map((h) => ({ question: h.question.slice(0, 1000), answer: h.answer.slice(0, 4000) }))
    : [];

  const out = await askRules(game, { question, mode, history });
  const { rows: saved } = await query(
    `INSERT INTO questions (game_id, user_id, kind, question, answer) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, question, answer, created_at`,
    [game.id, req.userId, mode, out.question, out.answer]
  );
  res.json({ entry: saved[0] });
}));

app.get('/api/games/:id/history', requireUser, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT q.id, q.question, q.answer, q.created_at, u.name AS asked_by
       FROM questions q LEFT JOIN users u ON u.id = q.user_id
      WHERE q.game_id = $1 ORDER BY q.created_at DESC LIMIT 30`,
    [Number(req.params.id)]
  );
  res.json({ history: rows });
}));

// ------------------------------------------------------------- Front + erreurs

app.get('/healthz', (_req, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(413).json({ error: 'Fichier trop lourd ou trop de fichiers (20 max, 25 Mo chacun)' });
  }
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  const msg = status === 429 ? "L'IA est très sollicitée, réessaie dans un instant" : err.message || 'Erreur serveur';
  res.status(status >= 500 ? 500 : status).json({ error: msg });
});

export async function start() {
  await initDb();
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`GM Pocket écoute sur le port ${PORT}`);
      resolve(server);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
