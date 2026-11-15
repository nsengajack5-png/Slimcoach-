import { HttpError } from '../http.js';
import { normalizeContent } from '../validate.js';

function present(row) {
  return { id: row.id, type: row.type, title: row.title, level: row.level, premium: !!row.premium, published: !!row.published, updated_at: row.updated_at, ...JSON.parse(row.data) };
}

export function register(r, app) {
  const { db } = app;

  r.get('/api/admin/content', { auth: 'admin' }, (ctx) => {
    const type = ctx.query.type === 'exercise' ? 'exercise' : ctx.query.type === 'meal' ? 'meal' : null;
    const rows = type
      ? db.prepare('SELECT * FROM content WHERE type = ? ORDER BY position, id').all(type)
      : db.prepare('SELECT * FROM content ORDER BY type, position, id').all();
    return { items: rows.map(present) };
  });

  r.post('/api/admin/content', { auth: 'admin' }, (ctx) => {
    const type = ctx.body.type === 'exercise' ? 'exercise' : ctx.body.type === 'meal' ? 'meal' : null;
    if (!type) throw new HttpError(400, 'Type de contenu invalide.');
    const c = normalizeContent(type, ctx.body);
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM content WHERE type = ?').get(type).p;
    const res = db
      .prepare('INSERT INTO content (type, title, level, premium, published, position, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(type, c.title, c.level, c.premium, c.published, pos, JSON.stringify(c.data));
    ctx.status = 201;
    return { item: present(db.prepare('SELECT * FROM content WHERE id = ?').get(Number(res.lastInsertRowid))) };
  });

  r.put('/api/admin/content/:id', { auth: 'admin' }, (ctx) => {
    const row = db.prepare('SELECT * FROM content WHERE id = ?').get(Number(ctx.params.id));
    if (!row) throw new HttpError(404, 'Contenu introuvable.');
    const c = normalizeContent(row.type, ctx.body);
    db.prepare("UPDATE content SET title = ?, level = ?, premium = ?, published = ?, data = ?, updated_at = datetime('now') WHERE id = ?")
      .run(c.title, c.level, c.premium, c.published, JSON.stringify(c.data), row.id);
    return { item: present(db.prepare('SELECT * FROM content WHERE id = ?').get(row.id)) };
  });

  r.del('/api/admin/content/:id', { auth: 'admin' }, (ctx) => {
    const res = db.prepare('DELETE FROM content WHERE id = ?').run(Number(ctx.params.id));
    if (!res.changes) throw new HttpError(404, 'Contenu introuvable.');
    return { ok: true };
  });

  r.get('/api/admin/users', { auth: 'admin' }, () => ({
    users: db.prepare('SELECT id, email, role, premium, is_demo, created_at FROM users ORDER BY id DESC LIMIT 500').all()
      .map((u) => ({ id: u.id, email: u.email, role: u.role, premium: !!u.premium, isDemo: !!u.is_demo, createdAt: u.created_at })),
  }));

  r.put('/api/admin/users/:id/premium', { auth: 'admin' }, (ctx) => {
    const premium = ctx.body.premium === true ? 1 : 0;
    const res = db
      .prepare("UPDATE users SET premium = ?, premium_since = CASE WHEN ? = 1 THEN COALESCE(premium_since, datetime('now')) ELSE NULL END WHERE id = ?")
      .run(premium, premium, Number(ctx.params.id));
    if (!res.changes) throw new HttpError(404, 'Utilisateur introuvable.');
    return { ok: true, premium: !!premium };
  });
}
