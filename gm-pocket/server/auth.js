// Sessions par cookie signé (HMAC) — pas de stockage serveur nécessaire.
import crypto from 'node:crypto';

const COOKIE = 'gmpocket_session';
const MAX_AGE_DAYS = 90;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET manquant ou trop court (16 caractères minimum)');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createToken(userId) {
  const exp = Date.now() + MAX_AGE_DAYS * 86400_000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = sign(`${id}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// Pose le cookie (navigateur) et renvoie le même jeton (appli Android).
export function setSessionCookie(res, userId) {
  const token = createToken(userId);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_DAYS * 86400}${secure}`
  );
  return token;
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Le navigateur utilise le cookie ; l'appli Android envoie le jeton dans « Authorization: Bearer ».
function readBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export function requireUser(req, res, next) {
  const userId = verifyToken(readBearer(req) || readCookie(req, COOKIE));
  if (!userId) return res.status(401).json({ error: 'Connexion requise' });
  req.userId = userId;
  next();
}

// Comparaison à temps constant pour le code famille.
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
