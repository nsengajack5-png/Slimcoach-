export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export function createRouter() {
  const routes = [];
  const add = (method, pattern, opts, handler) => {
    if (typeof opts === 'function') {
      handler = opts;
      opts = {};
    }
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, auth: opts.auth || 'none', handler });
  };
  return {
    add,
    get: (p, o, h) => add('GET', p, o, h),
    post: (p, o, h) => add('POST', p, o, h),
    put: (p, o, h) => add('PUT', p, o, h),
    del: (p, o, h) => add('DELETE', p, o, h),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = {};
        try {
          r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        } catch {
          throw new HttpError(400, 'Adresse invalide.');
        }
        return { route: r, params };
      }
      return null;
    },
  };
}

export async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Requête trop volumineuse.');
    chunks.push(chunk);
  }
  if (!size) return {};
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) throw new HttpError(415, 'Format non pris en charge (JSON attendu).');
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Données illisibles (JSON invalide).');
  }
}
