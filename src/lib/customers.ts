export type Charge = { date: string; amount: number };
export type Aging = { current: number; d30: number; d60: number; d90: number; over90: number; total: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Splits what a customer still owes into age buckets.
 * Payments clear the oldest debt first. "Current" = under 1 day old.
 */
export function ageDebt(charges: Charge[], credits: number, asOf: Date = new Date()): Aging {
  const out: Aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0, total: 0 };
  let left = credits;
  const sorted = [...charges].sort((a, b) => a.date.localeCompare(b.date));
  for (const c of sorted) {
    const used = Math.min(left, c.amount);
    left -= used;
    const owed = c.amount - used;
    if (owed <= 0.004) continue;
    const days = Math.floor((asOf.getTime() - new Date(c.date).getTime()) / 86400000);
    if (days < 1) out.current += owed;
    else if (days <= 30) out.d30 += owed;
    else if (days <= 60) out.d60 += owed;
    else if (days <= 90) out.d90 += owed;
    else out.over90 += owed;
  }
  out.current = r2(out.current); out.d30 = r2(out.d30); out.d60 = r2(out.d60); out.d90 = r2(out.d90); out.over90 = r2(out.over90);
  out.total = r2(out.current + out.d30 + out.d60 + out.d90 + out.over90 - Math.max(0, left));
  return out;
}

/** Would putting this much more on account break the limit? A limit of 0 means no limit. */
export function overLimit(balance: number, extra: number, limit: number) {
  return limit > 0 && balance + extra > limit + 0.005;
}
