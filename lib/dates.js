// Dates au format texte AAAA-MM-JJ (sans fuseau), manipulées en UTC pour éviter les décalages.

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  return Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 864e5);
}

export function todayIn(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function weekStart(s) {
  const dow = (new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(s, -dow);
}

export function inAllowedRange(s, today) {
  return s >= addDays(today, -730) && s <= addDays(today, 1);
}
