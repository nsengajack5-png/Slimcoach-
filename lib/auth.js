import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const N = 16384;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export const COOKIE_NAME = 'sc_session';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, { N, r: 8, p: 1, maxmem: MAXMEM });
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, n, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1, maxmem: MAXMEM });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummy;
export async function dummyVerify(password) {
  dummy ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummy);
}

const sha = (t) => createHash('sha256').update(t).digest('hex');
export const tokenHash = sha;

export function createSession(db, userId, days) {
  const token = randomBytes(32).toString('base64url');
  const expires = Date.now() + days * 864e5;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, expires);
  return { token, expires };
}

export function sessionUser(db, token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const row = db
    .prepare('SELECT u.id, u.email, u.role, u.premium, u.premium_since, u.is_demo, u.created_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .get(sha(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
    return null;
  }
  return row;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function purgeExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure, maxAgeSec }) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure) {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function createLimiter() {
  const hits = new Map();
  return {
    hit(key, max, windowMs) {
      const now = Date.now();
      let e = hits.get(key);
      if (!e || e.reset < now) {
        e = { count: 0, reset: now + windowMs };
        hits.set(key, e);
      }
      e.count += 1;
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return { ok: e.count <= max, retryAfter: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
    },
    clear(key) {
      hits.delete(key);
    },
  };
}
