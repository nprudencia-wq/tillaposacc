export type SoldLine = { product_id: string | null; name: string; quantity: number | string; refunded_qty: number | string; line_total: number | string };
export type SoldSummary = { name: string; sold: number; refunded: number; net: number; total: number };

/** Groups sale lines per product: gross sold, refunded and net units leaving stock. */
export function summarizeItemsSold(lines: SoldLine[]): SoldSummary[] {
  const m = new Map<string, SoldSummary>();
  for (const l of lines) {
    const k = l.product_id ?? `name:${l.name}`;
    const e = m.get(k) ?? { name: l.name, sold: 0, refunded: 0, net: 0, total: 0 };
    e.sold += Number(l.quantity); e.refunded += Number(l.refunded_qty); e.total += Number(l.line_total);
    e.net = e.sold - e.refunded;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, total: Math.round(e.total * 100) / 100 })).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}
