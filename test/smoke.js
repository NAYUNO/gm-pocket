// Test de bout en bout : base PGlite en mémoire + IA simulée. Lancer : npm test
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'pglite';
process.env.MOCK_AI = '1';
process.env.SESSION_SECRET = 'secret-de-test-assez-long';
process.env.FAMILY_CODE = 'famille';
process.env.PORT = '3999';

const { start } = await import('../server/index.js');
const server = await start();
const base = 'http://localhost:3999';
let cookie = '';

async function call(path, { method = 'GET', json, form } = {}) {
  const headers = cookie ? { cookie } : {};
  let body;
  if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base + path, { method: json || form ? method === 'GET' ? 'POST' : method : method, headers, body });
  const setC = res.headers.get('set-cookie');
  if (setC) cookie = setC.split(';')[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

try {
  assert.equal((await call('/api/games')).status, 401, 'non connecté = 401');
  assert.equal((await call('/api/register', { json: { name: 'Alex', password: 'motdepasse', familyCode: 'faux' } })).status, 403);
  const reg = await call('/api/register', { json: { name: 'Alex', password: 'motdepasse', familyCode: 'famille' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  assert.equal((await call('/api/register', { json: { name: 'alex', password: 'motdepasse', familyCode: 'famille' } })).status, 409);

  const me = await call('/api/me');
  assert.equal(me.data.user.name, 'Alex');
  assert.ok(me.data.modes.resume);

  // Import d'une "photo"
  const fd = new FormData();
  fd.append('name', 'Catan');
  fd.append('files', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'p1.jpg');
  const imp = await call('/api/import', { form: fd });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  const id = imp.data.game.id;
  assert.equal(imp.data.game.name, 'Catan');
  assert.match(imp.data.game.rules_md, /Mise en place/);

  // Fichier refusé (type non autorisé)
  const bad = new FormData();
  bad.append('files', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
  assert.equal((await call('/api/import', { form: bad })).status, 400);

  // Ajout de pages à un jeu existant
  const more = new FormData();
  more.append('gameId', String(id));
  more.append('files', new Blob([Buffer.from('%PDF-1.4')], { type: 'application/pdf' }), 'r.pdf');
  assert.equal((await call('/api/import', { form: more })).status, 200);

  const list = await call('/api/games');
  assert.equal(list.data.games.length, 1);

  const notes = await call(`/api/games/${id}`, { method: 'PATCH', json: { house_notes: 'On joue sans le voleur' } });
  assert.equal(notes.data.game.house_notes, 'On joue sans le voleur');

  const ask = await call(`/api/games/${id}/ask`, { json: { question: 'Combien de cartes ?' } });
  assert.equal(ask.status, 200, JSON.stringify(ask.data));
  assert.match(ask.data.entry.answer, /Combien de cartes/);
  const mode = await call(`/api/games/${id}/ask`, { json: { mode: 'resume', history: [{ question: 'a', answer: 'b' }] } });
  assert.match(mode.data.entry.question, /résumé express/i);

  const hist = await call(`/api/games/${id}/history`);
  assert.equal(hist.data.history.length, 2);
  assert.equal(hist.data.history[0].asked_by, 'Alex');

  // Front servi, y compris sur une route profonde
  const page = await call('/game/1');
  assert.match(page.data, /<title>GM Pocket<\/title>/);
  assert.equal((await call('/manifest.webmanifest')).status, 200);

  assert.equal((await call(`/api/games/${id}`, { method: 'DELETE' })).status, 200);
  await call('/api/logout', { json: {} });
  cookie = '';
  assert.equal((await call('/api/login', { json: { name: 'ALEX', password: 'motdepasse' } })).status, 200, 'connexion insensible à la casse');

  console.log('✅ Tous les tests passent');
} finally {
  server.close();
}
process.exit(0);
