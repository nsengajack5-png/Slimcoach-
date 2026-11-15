import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';
import { createRouter, readBody, HttpError } from './http.js';
import { COOKIE_NAME, parseCookies, sessionUser, createLimiter, purgeExpiredSessions } from './auth.js';
import { seedContent, seedAdmin, seedDemo } from './seed.js';
import { todayIn, isValidDate, diffDays } from './dates.js';
import { register as registerAuth } from './routes/auth.js';
import { register as registerMe } from './routes/me.js';
import { register as registerContent } from './routes/content.js';
import { register as registerPayment } from './routes/payment.js';
import { register as registerAdmin } from './routes/admin.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export async function createApp(config, log = console) {
  const db = openDb(config);
  seedContent(db);
  await seedAdmin(db, config, log);
  if (config.seedDemo) await seedDemo(db, config);
  purgeExpiredSessions(db);

  const router = createRouter();
  const limiter = createLimiter();
  const app = { db, config, router, limiter, log };
  registerAuth(router, app);
  registerMe(router, app);
  registerContent(router, app);
  registerPayment(router, app);
  registerAdmin(router, app);

  const clientIp = (req) => {
    if (config.trustProxy) {
      const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (xf) return xf;
    }
    return req.socket.remoteAddress || 'unknown';
  };

  function sendJson(res, status, body, headers = {}) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(data),
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...headers,
    });
    res.end(data);
  }

  async function handleApi(req, res, url) {
    const found = router.match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'Ressource introuvable.');
    const { route, params } = found;
    const mutating = req.method !== 'GET' && req.method !== 'HEAD';

    if (mutating && req.headers.origin) {
      let ok = false;
      try {
        ok = new URL(req.headers.origin).host === req.headers.host;
      } catch {}
      if (!ok) throw new HttpError(403, 'Requête refusée (origine non autorisée).');
    }

    const cookies = parseCookies(req.headers.cookie);
    const bearer = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
    const token = bearer ? bearer[1] : cookies[COOKIE_NAME];
    const user = sessionUser(db, token);

    if (route.auth !== 'none' && route.auth !== 'optional' && !user) throw new HttpError(401, 'Veuillez vous connecter.', { code: 'AUTH_REQUIRED' });
    if (route.auth === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Accès réservé à l’administrateur.');

    const body = mutating ? await readBody(req) : {};
    const query = Object.fromEntries(url.searchParams);
    const ctx = {
      req, res, params, query, body, user, token, app, config, db,
      ip: clientIp(req), status: 200, headers: {}, cookies: [],
    };
    const result = await route.handler(ctx);
    const headers = { ...ctx.headers };
    if (ctx.cookies.length) headers['Set-Cookie'] = ctx.cookies;
    sendJson(res, ctx.status, result ?? { ok: true }, headers);
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée.');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const full = path.normalize(path.join(config.publicDir, rel));
    if (!full.startsWith(config.publicDir + path.sep)) throw new HttpError(403, 'Accès refusé.');
    let stat;
    try {
      stat = fs.statSync(full);
      if (!stat.isFile()) throw new Error();
    } catch {
      throw new HttpError(404, 'Page introuvable.');
    }
    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
      ...SECURITY_HEADERS,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (err) {
      const status = err.status && Number.isInteger(err.status) ? err.status : 500;
      if (status >= 500) log.error('[SlimCoach] Erreur interne :', err);
      if (res.headersSent) return res.end();
      const payload = { error: status >= 500 ? 'Une erreur est survenue. Veuillez réessayer dans un instant.' : err.message };
      if (err.fields) payload.fields = err.fields;
      if (err.code) payload.code = err.code;
      const extra = err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {};
      sendJson(res, status, payload, extra);
    }
  });
  server.requestTimeout = 15000;

  const cleaner = setInterval(() => purgeExpiredSessions(db), 6 * 3600e3);
  cleaner.unref();

  return {
    server,
    db,
    config,
    close: () => new Promise((resolve) => {
      clearInterval(cleaner);
      server.close(() => {
        try { db.close(); } catch {}
        resolve();
      });
      server.closeAllConnections?.();
    }),
  };
}

export function resolveToday(ctx) {
  const server = todayIn(ctx.config.timezone);
  const q = ctx.query?.today ?? ctx.body?.today;
  if (q && isValidDate(q) && Math.abs(diffDays(q, server)) <= 1) return q;
  return server;
}
