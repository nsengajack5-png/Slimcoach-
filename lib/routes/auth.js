import { HttpError } from '../http.js';
import { normalizeContent } from '../validate.js';

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    premium: !!u.premium || u.role === 'admin',
    isDemo: !!u.is_demo,
    createdAt: u.created_at,
  };
}

function startSession(ctx, userId, wantsToken) {
  const { token, expires } = createSession(ctx.db, userId, ctx.config.sessionDays);
  ctx.cookies.push(sessionCookie(token, { secure: ctx.config.secureCookies, maxAgeSec: ctx.config.sessionDays * 86400 }));
  return wantsToken ? { token, expiresAt: expires } : {};
}

export function register(r, app) {
  const { db, limiter } = app;

  r.post('/api/auth/register', async (ctx) => {
    const rl = limiter.hit(`reg|${ctx.ip}`, ctx.config.registerLimitPerHour, 3600e3);
    if (!rl.ok) throw new HttpError(429, 'Trop de créations de compte depuis cette connexion. Réessayez plus tard.', { retryAfter: rl.retryAfter });
    const email = validateEmail(ctx.body.email);
    const password = validatePassword(ctx.body.password, email);
    const f = {};
    if (ctx.body.confirm !== undefined && ctx.body.confirm !== password) f.confirm = 'Les deux mots de passe ne sont pas identiques.';
    if (ctx.body.adult !== true) f.adult = 'Vous devez confirmer avoir 18 ans ou plus et avoir lu l’avis sur la santé.';
    if (Object.keys(f).length) throw new ValidationError(f);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new ValidationError({ email: 'Un compte existe déjà avec cette adresse. Essayez de vous connecter.' });
    }
    const id = await createUser(db, { email, password });
    const extra = startSession(ctx, id, ctx.body.client === 'native');
    ctx.status = 201;
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)), ...extra };
  });

  r.post('/api/auth/login', async (ctx) => {
    const email = String(ctx.body.email ?? '').trim().toLowerCase();
    const password = String(ctx.body.password ?? '');
    if (!email || !password) throw new ValidationError({ email: !email ? 'Indiquez votre adresse e-mail.' : undefined, password: !password ? 'Indiquez votre mot de passe.' : undefined });
    const key = `login|${ctx.ip}|${email}`;
    const rl = limiter.hit(key, 8, 10 * 60e3);
    if (!rl.ok) throw new HttpError(429, 'Trop de tentatives. Patientez quelques minutes avant de réessayer.', { retryAfter: rl.retryAfter });
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    let ok = false;
    if (row) ok = await verifyPassword(password, row.pass_hash);
    else await dummyVerify(password);
    if (!ok) throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
    limiter.clear(key);
    const extra = startSession(ctx, row.id, ctx.body.client === 'native');
    return { user: publicUser(row), ...extra };
  });

  r.post('/api/auth/logout', { auth: 'optional' }, (ctx) => {
    destroySession(db, ctx.token);
    ctx.cookies.push(clearCookie(ctx.config.secureCookies));
    return { ok: true };
  });

  r.get('/api/auth/me', { auth: 'optional' }, (ctx) => {
    const profile = ctx.user ? db.prepare('SELECT 1 AS ok FROM profiles WHERE user_id = ?').get(ctx.user.id) : null;
    return { user: ctx.user ? { ...publicUser(ctx.user), hasProfile: !!profile } : null };
  });

  r.put('/api/account/password', { auth: 'user' }, async (ctx) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(ctx.user.id);
    if (!(await verifyPassword(String(ctx.body.current ?? ''), row.pass_hash))) {
      throw new ValidationError({ current: 'Le mot de passe actuel est incorrect.' });
    }
    const next = validatePassword(ctx.body.next, row.email);
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(await hashPassword(next), row.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(row.id, tokenHash(ctx.token));
    return { ok: true };
  });

  r.get('/api/account/export', { auth: 'user' }, (ctx) => {
    const id = ctx.user.id;
    ctx.headers['Content-Disposition'] = 'attachment; filename="slimcoach-mes-donnees.json"';
    return {
      exporte_le: new Date().toISOString(),
      compte: publicUser(ctx.user),
      profil: db.prepare('SELECT first_name, age, height_cm, weight_kg, goal_kg, activity, diet, budget, updated_at FROM profiles WHERE user_id = ?').get(id) ?? null,
      pesees: db.prepare('SELECT date, kg, note FROM weights WHERE user_id = ? ORDER BY date').all(id),
      objectifs_habitudes: db.prepare('SELECT water_ml, sleep_h, activity_min FROM habit_goals WHERE user_id = ?').get(id) ?? null,
      habitudes: db.prepare('SELECT date, water_ml, sleep_h, activity_min FROM habit_logs WHERE user_id = ? ORDER BY date').all(id),
      exercices_termines: db.prepare('SELECT c.title AS exercice, d.date FROM exercise_done d JOIN content c ON c.id = d.content_id WHERE d.user_id = ? ORDER BY d.date').all(id),
    };
  });

  r.del('/api/account', { auth: 'user' }, async (ctx) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(ctx.user.id);
    if (!(await verifyPassword(String(ctx.body.password ?? ''), row.pass_hash))) {
      throw new ValidationError({ password: 'Mot de passe incorrect : le compte n’a pas été supprimé.' });
    }
    if (row.role === 'admin') {
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
      if (n <= 1) throw new HttpError(409, 'Vous êtes le dernier administrateur : créez-en un autre avant de supprimer ce compte.');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
    ctx.cookies.push(clearCookie(ctx.config.secureCookies));
    return { ok: true };
  });
}
