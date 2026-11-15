import { loadConfig } from '../lib/config.js';
import { openDb } from '../lib/db.js';
import { createUser } from '../lib/seed.js';
import { validateEmail, validatePassword } from '../lib/validate.js';

const args = process.argv.slice(2);
const email = args[0] || process.env.ADMIN_EMAIL;
const password = args[1] || process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Usage : npm run create-admin -- email "mot de passe"');
  process.exit(1);
}

try {
  const config = loadConfig(process.env);
  const db = openDb(config);
  const cleanEmail = validateEmail(email);
  validatePassword(password, cleanEmail);
  const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(cleanEmail);
  if (exists) {
    console.log(`Un administrateur existe déjà pour ${cleanEmail}.`);
    process.exit(0);
  }
  const userId = await createUser(db, { email: cleanEmail, password, role: 'admin' });
  console.log(`Administrateur créé : ${cleanEmail} (id ${userId})`);
  db.close();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
