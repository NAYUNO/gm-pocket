// GM Pocket — appli web (V1 famille)
const $app = document.getElementById('app');
const state = { user: null, modes: {}, games: [], threads: {} };

// ------------------------------------------------------------------ Plateforme (web ou appli Android)

const Cap = window.Capacitor;
const IS_NATIVE = !!Cap?.isNativePlatform?.();
// Dans l'appli, l'interface est embarquée et l'API est sur Render (adresse dans config.js).
const API_BASE = IS_NATIVE ? String(window.GM_CONFIG?.apiUrl || '').replace(/\/$/, '') : '';
const nativePlugin = (name) => (IS_NATIVE ? Cap.Plugins?.[name] || Cap.registerPlugin?.(name) : null);

function getToken() { try { return localStorage.getItem('gmpocket.token'); } catch { return null; } }
function setToken(t) { try { t ? localStorage.setItem('gmpocket.token', t) : localStorage.removeItem('gmpocket.token'); } catch { /* indisponible */ } }

// ------------------------------------------------------------------ Utilitaires

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Icônes SVG (trait, couleur héritée du texte)
const P = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  setup: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5"/>',
  newbie: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6M12 17.2v.1"/>',
  turn: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 17l5-5-5-5M21 12H9"/>',
  retry: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/>',
  save: '<path d="M5 12l4 4L19 6"/>',
};
const ic = (name, size = 20, sw = 2.2) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
const icon = { back: ic('back', 22, 2.4), chev: ic('chev', 18, 2.4), mic: ic('mic', 26), send: ic('send', 22, 2.4), plus: ic('plus', 20, 2.6) };
const MODE_ICONS = { resume: 'bolt', setup: 'setup', win: 'trophy', newbie: 'newbie', turn: 'turn' };

async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', ...opts, headers: {} };
  delete init.json;
  if (opts.json !== undefined) {
    init.method = init.method || 'POST';
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.json);
  }
  const token = IS_NATIVE ? getToken() : null;
  if (token) init.headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(API_BASE + path, init);
  } catch {
    throw new Error('Pas de connexion au serveur. Vérifie le réseau et réessaie.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (res.status === 401 && path !== '/api/login') {
    state.user = null;
    if (IS_NATIVE) setToken(null);
    location.hash = '#/login';
  }
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

function relDate(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400_000);
  if (days < 1) return "aujourd'hui";
  if (days < 2) return 'hier';
  if (days < 30) return `il y a ${days} jours`;
  const m = Math.floor(days / 30);
  return m < 12 ? `il y a ${m} mois` : `il y a ${Math.floor(m / 12)} an${m >= 24 ? 's' : ''}`;
}

// Mini rendu Markdown (titres, listes, gras, italique, citations, sources entre crochets).
function md(src) {
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]*(?:Règles|Notes)[^\]]*)\]/g, '<span class="src">[$1]</span>');
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '';
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); closeList();
      const lvl = Math.min(m[1].length, 3);
      html += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); closeList();
      html += `<blockquote>${inline(m[1])}</blockquote>`;
    } else if (/^-{3,}$/.test(line.trim())) {
      flushPara(); closeList();
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara(); closeList();
  return html;
}

// ------------------------------------------------------------------ Voix

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const NativeSR = nativePlugin('SpeechRecognition');
const NativeTTS = nativePlugin('TextToSpeech');
const canListen = !!(NativeSR || Recognition);
const canSpeak = !!NativeTTS || 'speechSynthesis' in window;

function stopSpeaking() {
  if (NativeTTS) NativeTTS.stop().catch(() => {});
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function frenchVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'fr-FR' && /google|natural|premium|enhanced/i.test(v.name))
    || voices.find((v) => v.lang === 'fr-FR')
    || voices.find((v) => v.lang?.startsWith('fr'));
}
if (!NativeTTS && 'speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

function speak(text) {
  if (!canSpeak) return;
  stopSpeaking();
  const clean = String(text)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[#*`>_]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n+/g, '. ')
    .replace(/\.\s*\./g, '.')
    .trim();
  if (NativeTTS) {
    NativeTTS.speak({ text: clean, lang: 'fr-FR', rate: 1.0 }).catch(() => {});
    return;
  }
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'fr-FR';
  const v = frenchVoice();
  if (v) u.voice = v;
  u.rate = 1.02;
  speechSynthesis.speak(u);
}

function getAutoRead() {
  try { return localStorage.getItem('gmpocket.autoread') !== '0'; } catch { return true; }
}
function setAutoRead(v) {
  try { localStorage.setItem('gmpocket.autoread', v ? '1' : '0'); } catch { /* stockage indisponible */ }
}

// ------------------------------------------------------------------ Routeur

function route() {
  stopSpeaking();
  const hash = location.hash || '#/';
  if (!state.user && hash !== '#/login') { location.hash = '#/login'; return; }
  let m;
  if (hash === '#/login') return viewLogin();
  if (hash.startsWith('#/add')) {
    const gid = new URLSearchParams(hash.split('?')[1] || '').get('game');
    return viewAdd(gid ? Number(gid) : null);
  }
  if ((m = hash.match(/^#\/game\/(\d+)(?:\/(\w+))?$/))) return viewGame(Number(m[1]), m[2] || 'ask');
  return viewLibrary();
}
window.addEventListener('hashchange', route);

// ------------------------------------------------------------------ Connexion

function viewLogin() {
  let mode = 'login';
  const render = () => {
    $app.innerHTML = `
      <div class="brand">
        <img class="brand-logo" src="/icons/logo.png" alt="GM Pocket — Rules Manager">
        <p>Le maître du jeu dans ta poche.</p>
      </div>
      <form class="paper form" id="f" novalidate>
        <label>Prénom<input type="text" name="name" autocomplete="username" required></label>
        <label>Mot de passe<input type="password" name="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required></label>
        ${mode === 'register' ? `<label>Code famille<input type="password" name="familyCode" required>
          <span class="hint">Le code partagé par la personne qui a installé GM Pocket.</span></label>` : ''}
        <p class="error" id="err" hidden></p>
        <button class="btn gold" type="submit">${mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
        <p class="hint" style="text-align:center;margin:0">
          ${mode === 'login' ? 'Première fois ?' : 'Déjà un compte ?'}
          <button type="button" class="switch-link" id="sw">${mode === 'login' ? 'Créer un compte' : 'Se connecter'}</button>
        </p>
      </form>`;
    document.getElementById('sw').onclick = () => { mode = mode === 'login' ? 'register' : 'login'; render(); };
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const err = document.getElementById('err');
      btn.disabled = true; err.hidden = true;
      try {
        const body = Object.fromEntries(new FormData(e.target));
        const { user, token } = await api(mode === 'login' ? '/api/login' : '/api/register', { json: body });
        if (IS_NATIVE) setToken(token);
        state.user = user;
        await loadMe();
        location.hash = '#/';
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false; btn.disabled = false;
      }
    };
  };
  render();
}

async function loadMe() {
  const { user, modes } = await api('/api/me');
  state.user = user;
  state.modes = modes;
}

// ------------------------------------------------------------------ Bibliothèque

async function viewLibrary() {
  $app.innerHTML = `
    <header class="top">
      <h1>GM Pocket<span class="dot">.</span></h1>
      <button class="ghost" id="logout">${esc(state.user.name)} ${ic('logout', 16)}</button>
    </header>
    <label class="search-wrap">${ic('search', 18)}<input class="search" id="q" type="search" placeholder="Chercher un jeu…" aria-label="Chercher un jeu"></label>
    <ul class="card-list" id="list"><li class="empty"><div class="spinner" style="margin:auto"></div></li></ul>
    <a class="fab" href="#/add">${icon.plus} Ajouter un jeu</a>`;
  document.getElementById('logout').onclick = async () => {
    await api('/api/logout', { json: {} }).catch(() => {});
    setToken(null);
    state.user = null;
    location.hash = '#/login';
  };
  try {
    const { games } = await api('/api/games');
    state.games = games;
  } catch (e) { toast(e.message); }

  const list = document.getElementById('list');
  const draw = (filter = '') => {
    const f = filter.trim().toLowerCase();
    const items = state.games.filter((g) => g.name.toLowerCase().includes(f));
    if (!state.games.length) {
      list.innerHTML = `<li class="empty"><div class="empty-ic">${ic('dice', 44, 1.6)}</div><div class="big">La ludothèque est vide</div>
        Prends en photo le livret de règles d'un jeu (ou importe son PDF) pour commencer.</li>`;
      return;
    }
    if (!items.length) { list.innerHTML = `<li class="empty">Aucun jeu ne correspond.</li>`; return; }
    list.innerHTML = items.map((g) => `
      <li><a class="paper game-card" href="#/game/${g.id}">
        <span class="monogram">${esc(g.name.trim()[0]?.toUpperCase() || '?')}</span>
        <span>
          <span class="name">${esc(g.name)}</span><br>
          <span class="meta">${[g.players, g.duration].filter(Boolean).map(esc).join(' · ') || 'Règles enregistrées'}${
            g.last_asked ? ` · question ${relDate(g.last_asked)}` : ''}</span>
        </span>
        <span class="chev">${icon.chev}</span>
      </a></li>`).join('');
  };
  draw();
  document.getElementById('q').oninput = (e) => draw(e.target.value);
}

// ------------------------------------------------------------------ Import

async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1800;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

async function viewAdd(gameId) {
  let existing = null;
  if (gameId) {
    try { existing = (await api(`/api/games/${gameId}`)).game; } catch (e) { toast(e.message); }
  }
  const files = [];
  $app.innerHTML = `
    <header class="top">
      <button class="back" aria-label="Retour" onclick="history.back()">${icon.back}</button>
      <h1>${existing ? 'Ajouter des pages' : 'Nouveau jeu'}</h1>
    </header>
    <form class="paper form" id="f">
      ${existing
        ? `<p class="hint" style="margin:0">Les nouvelles pages seront fusionnées avec les règles de <strong>${esc(existing.name)}</strong>.</p>`
        : `<label>Nom du jeu <span class="hint">(facultatif, l'IA le devine sinon)</span>
            <input type="text" name="name" placeholder="ex. Les Aventuriers du Rail"></label>`}
      <div class="pick">
        <button type="button" class="drop" id="shoot"><span class="drop-ic">${ic('camera', 30, 1.8)}</span><strong>Prendre une page en photo</strong>
          Recommence pour chaque page</button>
        <button type="button" class="drop" id="drop"><span class="drop-ic">${ic('files', 30, 1.8)}</span><strong>Choisir photos ou PDF</strong>
          Depuis la galerie ou les fichiers</button>
      </div>
      <p class="hint" style="margin:0">Une photo par page, bien à plat et éclairée. 20 fichiers max par envoi.</p>
      <input type="file" id="file" accept="image/*,application/pdf" multiple hidden>
      <input type="file" id="camera" accept="image/*" capture="environment" hidden>
      <div class="thumbs" id="thumbs"></div>
      <div class="working" id="working" hidden><div class="spinner"></div>
        <div><strong>L'IA lit le livret…</strong><br><span class="hint">Ça peut prendre 1 à 2 minutes. Garde l'appli ouverte.</span></div></div>
      <p class="error" id="err" hidden></p>
      <button class="btn gold" id="go" type="submit" disabled>Transcrire les règles</button>
    </form>`;

  const input = document.getElementById('file');
  const thumbs = document.getElementById('thumbs');
  const go = document.getElementById('go');
  const drop = document.getElementById('drop');
  const camera = document.getElementById('camera');
  drop.onclick = () => input.click();
  document.getElementById('shoot').onclick = () => camera.click();

  const drawThumbs = () => {
    thumbs.innerHTML = files.map((f, i) => `
      <figure>${f.type === 'application/pdf' ? '<div class="pdf">PDF</div>' : `<img src="${f.url}" alt="Page ${i + 1}">`}
        <button type="button" data-i="${i}" aria-label="Retirer">×</button></figure>`).join('');
    thumbs.querySelectorAll('button').forEach((b) => (b.onclick = () => { files.splice(Number(b.dataset.i), 1); drawThumbs(); }));
    go.disabled = !files.length;
  };

  const addFiles = async (el) => {
    for (const raw of el.files) {
      if (files.length >= 20) { toast('20 fichiers maximum par envoi'); break; }
      const f = await compressImage(raw);
      f.url = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
      files.push(f);
    }
    el.value = '';
    drawThumbs();
  };
  input.onchange = () => addFiles(input);
  camera.onchange = () => addFiles(camera);

  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('err');
    err.hidden = true;
    go.disabled = true;
    document.getElementById('working').hidden = false;
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    if (existing) fd.append('gameId', existing.id);
    const nameInput = e.target.querySelector('input[name=name]');
    if (nameInput?.value.trim()) fd.append('name', nameInput.value.trim());
    try {
      const { game } = await api('/api/import', { method: 'POST', body: fd });
      toast(existing ? 'Pages ajoutées' : `« ${game.name} » est prêt !`);
      location.hash = `#/game/${game.id}/rules`;
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false; go.disabled = false;
      document.getElementById('working').hidden = true;
    }
  };
}

// ------------------------------------------------------------------ Fiche jeu

async function viewGame(id, tab) {
  let game;
  try { game = (await api(`/api/games/${id}`)).game; } catch (e) { toast(e.message); location.hash = '#/'; return; }

  $app.innerHTML = `
    <header class="top">
      <button class="back" aria-label="Retour" onclick="location.hash='#/'">${icon.back}</button>
      <h1>${esc(game.name)}</h1>
    </header>
    <p class="meta-line">${[game.players, game.duration].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</p>
    <div class="tabs" role="tablist">
      ${[['ask', 'Demander'], ['rules', 'Règles'], ['notes', 'Notes']].map(([k, l]) =>
        `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${ic({ ask: 'chat', rules: 'book', notes: 'note' }[k], 17)} ${l}</button>`).join('')}
    </div>
    <section id="pane"></section>`;
  $app.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => (location.hash = `#/game/${id}/${b.dataset.tab}`)));

  const pane = document.getElementById('pane');
  if (tab === 'rules') return paneRules(pane, game);
  if (tab === 'notes') return paneNotes(pane, game);
  return paneAsk(pane, game);
}

function paneAsk(pane, game) {
  const thread = (state.threads[game.id] ||= []);
  pane.innerHTML = `
    <div class="chips">${Object.entries(state.modes).map(([k, l]) => `<button class="chip" data-mode="${k}">${ic(MODE_ICONS[k] || 'bolt', 16)} ${esc(l)}</button>`).join('')}</div>
    ${canSpeak ? `<label class="autoread"><input type="checkbox" id="autoread" ${getAutoRead() ? 'checked' : ''}> Lire les réponses à voix haute</label>` : ''}
    <div class="thread" id="thread"></div>
    <div class="askbar"><div class="inner">
      <textarea id="qin" rows="1" placeholder="${canListen ? 'Pose ta question ou appuie sur le micro…' : 'Pose ta question…'}"></textarea>
      <button class="send" id="send" aria-label="Envoyer">${icon.send}</button>
      ${canListen ? `<button class="mic" id="mic" aria-label="Parler">${icon.mic}</button>` : ''}
    </div></div>`;

  const $thread = document.getElementById('thread');
  const qin = document.getElementById('qin');
  const ar = document.getElementById('autoread');
  if (ar) ar.onchange = () => setAutoRead(ar.checked);

  const drawThread = () => {
    if (!thread.length) {
      $thread.innerHTML = `<div class="empty">Une question sur <strong>${esc(game.name)}</strong> ?<br>
        Exemple : « Est-ce qu'on peut jouer deux cartes dans le même tour ? »</div>`;
      return;
    }
    $thread.innerHTML = thread.map((t, i) => `
      <div class="q">${esc(t.question)}</div>
      ${t.pending
        ? '<div class="paper a"><div class="spinner"></div></div>'
        : `<div class="paper a"><div class="md">${md(t.answer)}</div>
            <div class="tools">${canSpeak ? `<button data-say="${i}">${ic('speaker', 16)} Écouter</button>` : ''}</div></div>`}`).join('');
    $thread.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => speak(thread[Number(b.dataset.say)].answer)));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };
  drawThread();

  const ask = async ({ question = '', mode = 'ask' }) => {
    if (mode === 'ask' && !question.trim()) return;
    stopSpeaking();
    const history = thread.filter((t) => !t.pending).slice(-4).map(({ question, answer }) => ({ question, answer }));
    const entry = { question: mode === 'ask' ? question : state.modes[mode], pending: true };
    thread.push(entry);
    drawThread();
    try {
      const res = await api(`/api/games/${game.id}/ask`, { json: { question, mode, history } });
      entry.answer = res.entry.answer;
      entry.pending = false;
      drawThread();
      if (canSpeak && getAutoRead()) speak(entry.answer);
    } catch (e) {
      thread.splice(thread.indexOf(entry), 1);
      drawThread();
      toast(e.message);
    }
  };

  pane.querySelectorAll('.chip').forEach((c) => (c.onclick = () => ask({ mode: c.dataset.mode })));
  const sendText = () => { const q = qin.value; qin.value = ''; autoGrow(); ask({ question: q }); };
  document.getElementById('send').onclick = sendText;
  qin.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } };
  const autoGrow = () => { qin.style.height = 'auto'; qin.style.height = Math.min(qin.scrollHeight, 120) + 'px'; };
  qin.oninput = autoGrow;

  const mic = document.getElementById('mic');
  if (mic) {
    let rec = null;
    let nativeOn = false;

    // Appli Android : reconnaissance vocale native (plus fiable que celle de la WebView).
    const nativeMic = async () => {
      if (nativeOn) { NativeSR.stop().catch(() => {}); return; }
      try {
        const { available } = await NativeSR.available();
        if (!available) { toast("La reconnaissance vocale n'est pas disponible sur ce téléphone"); return; }
        let perm = await NativeSR.checkPermissions();
        if (perm.speechRecognition !== 'granted') perm = await NativeSR.requestPermissions();
        if (perm.speechRecognition !== 'granted') { toast("Autorise le micro pour poser tes questions à l'oral"); return; }
        stopSpeaking();
        await NativeSR.removeAllListeners();
        qin.value = '';
        await NativeSR.addListener('partialResults', (d) => {
          if (d.matches?.[0]) { qin.value = d.matches[0]; autoGrow(); }
        });
        await NativeSR.addListener('listeningState', (d) => {
          if (d.status !== 'stopped' || !nativeOn) return;
          nativeOn = false;
          mic.classList.remove('listening');
          if (qin.value.trim()) sendText();
        });
        nativeOn = true;
        mic.classList.add('listening');
        await NativeSR.start({ language: 'fr-FR', maxResults: 1, partialResults: true, popup: false });
      } catch (e) {
        nativeOn = false;
        mic.classList.remove('listening');
        toast('Micro : ' + (e.message || e));
      }
    };

    mic.onclick = () => {
      if (NativeSR) { nativeMic(); return; }
      if (rec) { rec.stop(); return; }
      stopSpeaking();
      rec = new Recognition();
      rec.lang = 'fr-FR';
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        qin.value = (finalText + interim).trim();
        autoGrow();
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed') toast("Autorise le micro pour poser tes questions à l'oral");
        else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Micro : ' + e.error);
      };
      rec.onend = () => {
        mic.classList.remove('listening');
        rec = null;
        if (qin.value.trim()) sendText();
      };
      mic.classList.add('listening');
      rec.start();
    };
  }
}

function paneRules(pane, game) {
  const view = () => {
    pane.innerHTML = `
      <div class="rules-actions">
        <a class="btn gold" href="#/add?game=${game.id}" style="text-decoration:none">${ic('plus', 18, 2.6)} Ajouter des pages</a>
        <button class="btn light" id="edit">${ic('edit', 18)} Corriger le texte</button>
      </div>
      <article class="paper rules md">${game.rules_md.trim() ? md(game.rules_md) : '<p>Aucune règle enregistrée pour l\'instant.</p>'}</article>
      <div class="rules-actions" style="margin-top:28px">
        <button class="btn danger" id="del">${ic('trash', 18)} Supprimer ce jeu</button>
      </div>`;
    document.getElementById('edit').onclick = edit;
    document.getElementById('del').onclick = async () => {
      if (!confirm(`Supprimer « ${game.name} » et ses règles ? C'est définitif.`)) return;
      await api(`/api/games/${game.id}`, { method: 'DELETE' });
      toast('Jeu supprimé');
      location.hash = '#/';
    };
  };
  const edit = () => {
    pane.innerHTML = `
      <form class="paper form" id="f">
        <label>Nom<input type="text" name="name" value="${esc(game.name)}"></label>
        <div class="row">
          <label style="flex:1">Joueurs<input type="text" name="players" value="${esc(game.players || '')}"></label>
          <label style="flex:1">Durée<input type="text" name="duration" value="${esc(game.duration || '')}"></label>
        </div>
        <label>Règles <span class="hint">(Markdown : ## Titre, - liste, **gras**)</span>
          <textarea name="rules_md" rows="18">${esc(game.rules_md)}</textarea></label>
        <div class="row"><button class="btn gold" type="submit">${ic('save', 18, 2.6)} Enregistrer</button><button class="btn light" type="button" id="cancel">Annuler</button></div>
      </form>`;
    document.getElementById('cancel').onclick = view;
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        game = Object.assign(game, (await api(`/api/games/${game.id}`, { method: 'PATCH', json: Object.fromEntries(new FormData(e.target)) })).game);
        toast('Règles enregistrées');
        document.querySelector('.top h1').textContent = game.name;
        view();
      } catch (ex) { toast(ex.message); }
    };
  };
  view();
}

function paneNotes(pane, game) {
  pane.innerHTML = `
    <form class="paper form" id="f">
      <label>Nos règles maison et rappels
        <span class="hint">L'IA en tient compte dans ses réponses. Ex : « On joue sans l'extension », « Les enfants commencent avec 2 cartes de plus ».</span>
        <textarea name="house_notes" rows="10">${esc(game.house_notes)}</textarea></label>
      <button class="btn gold" type="submit">${ic('save', 18, 2.6)} Enregistrer</button>
    </form>
    <h2 style="font-family:var(--font-title);margin:28px 0 10px">Questions récentes</h2>
    <div class="thread" id="hist"><div class="spinner"></div></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { game: g } = await api(`/api/games/${game.id}`, { method: 'PATCH', json: Object.fromEntries(new FormData(e.target)) });
      game.house_notes = g.house_notes;
      toast('Notes enregistrées');
    } catch (ex) { toast(ex.message); }
  };
  api(`/api/games/${game.id}/history`).then(({ history }) => {
    const el = document.getElementById('hist');
    if (!el) return;
    el.innerHTML = history.length
      ? history.map((h) => `<div class="q">${esc(h.question)}</div>
          <div class="paper a"><div class="md">${md(h.answer)}</div>
          <div class="tools"><span class="who">${esc(h.asked_by || '')} · ${relDate(h.created_at)}</span></div></div>`).join('')
      : '<p class="hint" style="color:rgba(246,239,225,.7)">Aucune question pour l\'instant.</p>';
  }).catch(() => {});
}

// ------------------------------------------------------------------ Démarrage

// Écran de démarrage (splash) : affiché tout de suite, le temps de joindre le serveur.
// Hébergement gratuit : le serveur s'endort après 15 min, le réveil peut prendre ~1 min.
function showSplash() {
  $app.innerHTML = `
    <div class="splash">
      <img class="splash-logo" src="/icons/logo.png" alt="GM Pocket — Rules Manager">
      <div class="splash-status" id="splash-status" hidden>
        <div class="spinner"></div>
        <span>Le maître du jeu se réveille…<br><small>Jusqu'à une minute après une longue pause.</small></span>
      </div>
      <p class="splash-sign">yumzg</p>
    </div>`;
}

function showOffline(message) {
  showSplash();
  const st = document.getElementById('splash-status');
  st.hidden = false;
  st.innerHTML = `<span>${esc(message)}</span><button class="btn gold" id="retry">${ic('retry', 18)} Réessayer</button>`;
  document.getElementById('retry').onclick = boot;
}

async function boot() {
  showSplash();
  const started = Date.now();
  // Le splash natif (icône sur fond bleu) laisse place au splash de l'appli dès qu'il est affiché.
  requestAnimationFrame(() => nativePlugin('SplashScreen')?.hide({ fadeOutDuration: 250 }).catch?.(() => {}));
  const slow = setTimeout(() => {
    const st = document.getElementById('splash-status');
    if (st) st.hidden = false;
  }, 1500);

  if (IS_NATIVE && !API_BASE) {
    clearTimeout(slow);
    showOffline("L'adresse du serveur n'est pas configurée dans l'appli (mobile.config.json).");
    return;
  }
  try {
    await loadMe();
  } catch (e) {
    if (/Pas de connexion/.test(e.message)) {
      clearTimeout(slow);
      showOffline('Impossible de joindre le serveur. Vérifie ta connexion internet.');
      return;
    }
    /* sinon : pas connecté → écran de connexion */
  }
  clearTimeout(slow);
  // Dans l'appli, on laisse le splash visible un court instant pour éviter un flash.
  const wait = IS_NATIVE ? Math.max(0, 900 - (Date.now() - started)) : 0;
  setTimeout(route, wait);
}
boot();

// Quand on revient sur l'appli après une pause, on réveille le serveur en avance.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') fetch(API_BASE + '/healthz', { cache: 'no-store' }).catch(() => {});
});

if (!IS_NATIVE && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
