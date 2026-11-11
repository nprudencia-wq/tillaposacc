export type DepositMove = { id: string; type: string; reason: string; amount: number; currency: string; created_at: string };
export type DepositRow = { id: string; who: string; amount: number; currency: string; taken: string; claimed: string | null; days: number };

const TAKEN = "Bottle deposit taken", RETURNED = "Bottle deposit returned";
const note = (r: string, p: string) => r.slice(p.length).replace(/^\s*—\s*/, "").trim();

/** Pairs each refund with the oldest open deposit of the same note, currency and amount (falling back to same currency and amount). */
export function matchDeposits(moves: DepositMove[], now = new Date()): DepositRow[] {
  const sorted = [...moves].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rows: DepositRow[] = [];
  for (const m of sorted) {
    if (m.type === "paid_in" && m.reason.startsWith(TAKEN)) {
      rows.push({ id: m.id, who: note(m.reason, TAKEN), amount: Number(m.amount), currency: m.currency, taken: m.created_at, claimed: null, days: 0 });
    } else if (m.type === "paid_out" && m.reason.startsWith(RETURNED)) {
      const who = note(m.reason, RETURNED);
      const open = rows.filter((r) => !r.claimed && r.currency === m.currency && Math.abs(r.amount - Number(m.amount)) < 0.005);
      const hit = open.find((r) => who && r.who.toLowerCase() === who.toLowerCase()) ?? open[0];
      if (hit) hit.claimed = m.created_at;
    }
  }
  for (const r of rows) r.days = Math.floor(((r.claimed ? new Date(r.claimed) : now).getTime() - new Date(r.taken).getTime()) / 86400000);
  return rows.reverse();
}
