import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const flag = (key, def) => (env[key] ?? (def ? '1' : '0')) === '1';
  return {
    root,
    publicDir: path.join(root, 'public'),
    isProd,
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || path.join(root, 'data', 'slimcoach.db'),
    secureCookies: flag('COOKIE_SECURE', isProd),
    trustProxy: flag('TRUST_PROXY', false),
    seedDemo: flag('SEED_DEMO', !isProd),
    devUnlock: flag('DEV_TEST_UNLOCK', !isProd),
    adminEmail: (env.ADMIN_EMAIL || '').trim(),
    adminPassword: env.ADMIN_PASSWORD || '',
    timezone: env.APP_TIMEZONE || 'Africa/Lubumbashi',
    sessionDays: 30,
    registerLimitPerHour: Number(env.REGISTER_LIMIT_PER_HOUR || 10),
    premium: {
      priceUsd: env.PREMIUM_PRICE_USD || '9.99',
      currency: 'USD',
    },
    paymentProvider: env.PAYMENT_PROVIDER || '',
  };
}
