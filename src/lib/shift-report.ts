import type { ShiftSummary } from "@/components/Shift";
import type { QueuedSale } from "@/lib/offline";
import { round2, paidUSD, currencyRate } from "@/lib/pos";
import { summarizeItemsSold, type SoldLine } from "@/lib/items-sold";

export type ShiftSnapshot = { summary: ShiftSummary; refs: string[]; lines: SoldLine[]; checkedAt: string };

/** Server snapshot is authoritative; add only device sales it does not contain. */
export function mergeShiftReport(snapshot: ShiftSnapshot, sales: QueuedSale[], isCash: (method: string) => boolean) {
  const summary = structuredClone(snapshot.summary);
  const refs = new Set(snapshot.refs);
  const local = sales.filter((s) => s.shift_id === summary.shift.id && !refs.has(s.client_ref));
  const lines = [...snapshot.lines];
  const fields = summary as unknown as Record<string, number>;
  for (const sale of local) {
    if (refs.has(sale.client_ref)) continue;
    refs.add(sale.client_ref);
    summary.sales_count++;
    summary.sales_total_usd = round2(Number(summary.sales_total_usd) + sale.total);
    for (const p of sale.payments) {
      const found = summary.payments.find((x) => x.method === p.method && x.currency === p.currency);
      if (found) found.amount = round2(Number(found.amount) + p.amount);
      else summary.payments.push({ method: p.method, currency: p.currency, amount: p.amount });
      if (isCash(p.method)) {
        const suffix = p.currency === "USD" ? "usd" : p.currency === "ZiG" ? "zig" : "zar";
        fields[`cash_in_${suffix}`] = round2(Number(fields[`cash_in_${suffix}`] ?? 0) + p.amount);
        fields[`expected_${suffix}`] = round2(Number(fields[`expected_${suffix}`] ?? 0) + p.amount);
      }
    }
    const change = sale.receipt?.change ?? Math.max(0, paidUSD(sale.payments, sale.rate ?? 1, sale.rand_rate ?? 0) - sale.total);
    const suffix = sale.currency === "USD" ? "usd" : sale.currency === "ZiG" ? "zig" : "zar";
    const converted = round2(change * currencyRate(sale.currency, sale.rate ?? 1, sale.rand_rate ?? 0));
    fields[`change_${suffix}`] = round2(Number(fields[`change_${suffix}`] ?? 0) + converted);
    fields[`expected_${suffix}`] = round2(Number(fields[`expected_${suffix}`] ?? 0) - converted);
    sale.items.forEach((item, i) => {
      const receipt = sale.receipt?.items[i];
      lines.push({ product_id: item.product_id, name: receipt?.name ?? item.product_id, quantity: item.quantity, refunded_qty: 0, line_total: receipt?.line_total ?? item.quantity * (item.unit_price ?? 0) });
    });
  }
  return { summary, items: summarizeItemsSold(lines) };
}