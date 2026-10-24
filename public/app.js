// GM Pocket — appli web (V1 famille)
const $app = document.getElementById('app');
const state = { user: null, modes: {}, games: [], threads: {} };

// ------------------------------------------------------------------ Utilitaires

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const icon = {
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  mic: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  send: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', ...opts };
  if (opts.json !== undefined) {
    init.method = init.method || 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, init);
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (res.status === 401 && path !== '/api/login') {
    state.user = null;
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
const canSpeak = 'speechSynthesis' in window;

function frenchVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'fr-FR' && /google|natural|premium|enhanced/i.test(v.name))
    || voices.find((v) => v.lang === 'fr-FR')
    || voices.find((v) => v.lang?.startsWith('fr'));
}
if (canSpeak) speechSynthesis.onvoiceschanged = () => {};

function speak(text) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const clean = String(text)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[#*`>_]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n+/g, '. ')
    .replace(/\.\s*\./g, '.')
    .trim();
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
  if (canSpeak) speechSynthesis.cancel();
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
        <img class="logo" src="/icons/icon.svg" alt="">
        <h1>GM Pocket</h1>
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
        const { user } = await api(mode === 'login' ? '/api/login' : '/api/register', { json: body });
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
      <button class="ghost" id="logout">${esc(state.user.name)} · Quitter</button>
    </header>
    <input class="search" id="q" type="search" placeholder="Chercher un jeu…" aria-label="Chercher un jeu">
    <ul class="card-list" id="list"><li class="empty"><div class="spinner" style="margin:auto"></div></li></ul>
    <a class="fab" href="#/add">${icon.plus} Ajouter un jeu</a>`;
  document.getElementById('logout').onclick = async () => {
    await api('/api/logout', { json: {} });
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
      list.innerHTML = `<li class="empty"><div class="big">La ludothèque est vide</div>
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
      <div class="drop" id="drop" role="button" tabindex="0">
        <strong>📷 Photos ou PDF du livret</strong>
        Une photo par page, bien à plat et éclairée. 20 fichiers max par envoi.
      </div>
      <input type="file" id="file" accept="image/*,application/pdf" multiple hidden>
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
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); };

  const drawThumbs = () => {
    thumbs.innerHTML = files.map((f, i) => `
      <figure>${f.type === 'application/pdf' ? '<div class="pdf">PDF</div>' : `<img src="${f.url}" alt="Page ${i + 1}">`}
        <button type="button" data-i="${i}" aria-label="Retirer">×</button></figure>`).join('');
    thumbs.querySelectorAll('button').forEach((b) => (b.onclick = () => { files.splice(Number(b.dataset.i), 1); drawThumbs(); }));
    go.disabled = !files.length;
  };

  input.onchange = async () => {
    for (const raw of input.files) {
      if (files.length >= 20) { toast('20 fichiers maximum par envoi'); break; }
      const f = await compressImage(raw);
      f.url = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
      files.push(f);
    }
    input.value = '';
    drawThumbs();
  };

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
        `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('')}
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
    <div class="chips">${Object.entries(state.modes).map(([k, l]) => `<button class="chip" data-mode="${k}">${esc(l)}</button>`).join('')}</div>
    ${canSpeak ? `<label class="autoread"><input type="checkbox" id="autoread" ${getAutoRead() ? 'checked' : ''}> Lire les réponses à voix haute</label>` : ''}
    <div class="thread" id="thread"></div>
    <div class="askbar"><div class="inner">
      <textarea id="qin" rows="1" placeholder="${Recognition ? 'Pose ta question ou appuie sur le micro…' : 'Pose ta question…'}"></textarea>
      <button class="send" id="send" aria-label="Envoyer">${icon.send}</button>
      ${Recognition ? `<button class="mic" id="mic" aria-label="Parler">${icon.mic}</button>` : ''}
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
            <div class="tools">${canSpeak ? `<button data-say="${i}">🔊 Écouter</button>` : ''}</div></div>`}`).join('');
    $thread.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => speak(thread[Number(b.dataset.say)].answer)));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };
  drawThread();

  const ask = async ({ question = '', mode = 'ask' }) => {
    if (mode === 'ask' && !question.trim()) return;
    if (canSpeak) speechSynthesis.cancel();
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
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      if (canSpeak) speechSynthesis.cancel();
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
        <a class="btn gold" href="#/add?game=${game.id}" style="text-decoration:none">+ Ajouter des pages</a>
        <button class="btn light" id="edit">Corriger le texte</button>
      </div>
      <article class="paper rules md">${game.rules_md.trim() ? md(game.rules_md) : '<p>Aucune règle enregistrée pour l\'instant.</p>'}</article>
      <div class="rules-actions" style="margin-top:28px">
        <button class="btn danger" id="del">Supprimer ce jeu</button>
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
        <div class="row"><button class="btn gold" type="submit">Enregistrer</button><button class="btn light" type="button" id="cancel">Annuler</button></div>
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
      <button class="btn gold" type="submit">Enregistrer</button>
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

// Hébergement gratuit : le serveur s'endort après 15 min. On affiche un message
// pendant le réveil (jusqu'à ~1 min) au lieu d'un écran figé.
function showWaking() {
  $app.innerHTML = `
    <div class="brand">
      <img class="logo" src="/icons/icon.svg" alt="">
      <h1>GM Pocket</h1>
      <p>Le maître du jeu se réveille…</p>
    </div>
    <div class="paper" style="margin:0 auto;max-width:420px">
      <div class="working" style="background:none">
        <div class="spinner"></div>
        <div><strong>Démarrage du serveur</strong><br>
        <span class="hint">Ça peut prendre jusqu'à une minute après une longue pause.</span></div>
      </div>
    </div>`;
}

(async () => {
  const slow = setTimeout(showWaking, 1200);
  try { await loadMe(); } catch { /* pas connecté */ }
  clearTimeout(slow);
  route();
})();

// Quand on revient sur l'appli après une pause, on réveille le serveur en avance.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') fetch('/healthz', { cache: 'no-store' }).catch(() => {});
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
