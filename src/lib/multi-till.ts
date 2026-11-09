export type TillShift = { id: string; device_name: string | null; cashier: string; status: string; opened_at: string; closed_at: string | null; variance_usd: number | null };
export type TillSale = { shift_id: string | null; total: number; status: string; payments: { method: string; amount: number }[] };
export type TillRow = { till: string; sales: number; count: number; average: number; cashiers: string[]; open: boolean; lastActive: string; variance: number | null; methods: Record<string, number>; shiftIds: string[] };

export const UNNAMED_TILL = "Unnamed till";

/** Group a day's sales by the fixed till name recorded on each shift. Refunded sales are excluded. */
export function groupByTill(shifts: TillShift[], sales: TillSale[]): TillRow[] {
  const byShift = new Map(shifts.map((s) => [s.id, s]));
  const rows = new Map<string, TillRow>();
  const row = (name: string) => {
    let r = rows.get(name);
    if (!r) { r = { till: name, sales: 0, count: 0, average: 0, cashiers: [], open: false, lastActive: "", variance: null, methods: {}, shiftIds: [] }; rows.set(name, r); }
    return r;
  };
  for (const s of shifts) {
    const r = row(s.device_name?.trim() || UNNAMED_TILL);
    r.shiftIds.push(s.id);
    if (!r.cashiers.includes(s.cashier)) r.cashiers.push(s.cashier);
    if (s.status === "open") r.open = true;
    const t = s.closed_at ?? s.opened_at;
    if (t > r.lastActive) r.lastActive = t;
    if (s.variance_usd !== null && s.variance_usd !== undefined) r.variance = (r.variance ?? 0) + Number(s.variance_usd);
  }
  for (const sale of sales) {
    if (sale.status === "refunded") continue;
    const sh = sale.shift_id ? byShift.get(sale.shift_id) : undefined;
    const r = row(sh?.device_name?.trim() || UNNAMED_TILL);
    r.sales += Number(sale.total); r.count += 1;
    for (const p of sale.payments) r.methods[p.method] = (r.methods[p.method] ?? 0) + Number(p.amount);
  }
  for (const r of rows.values()) r.average = r.count ? r.sales / r.count : 0;
  return [...rows.values()].sort((a, b) => b.sales - a.sales);
}
