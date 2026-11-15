export const providers = {};

export function activeProvider(config, env = process.env) {
  const p = providers[config.paymentProvider];
  return p && p.isConfigured(env) ? p : null;
}

export function fulfillOrder(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || !order.user_id) return false;
  db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(orderId);
  db.prepare("UPDATE users SET premium = 1, premium_since = COALESCE(premium_since, datetime('now')) WHERE id = ?").run(order.user_id);
  return true;
}
