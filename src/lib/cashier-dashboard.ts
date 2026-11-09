import type { QueuedSale } from "@/lib/offline";

export function harareDay(at = new Date()) {
  const day = new Date(at.getTime() + 2 * 3600000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+02:00`).toISOString();
  return { day, start, end: new Date(Date.parse(start) + 86400000).toISOString() };
}

export function cashierDailyTotals(
  sales: { total: number; client_ref: string | null }[],
  queue: QueuedSale[], storeId: string, userId: string, start: string, end: string,
) {
  const refs = new Set(sales.map((s) => s.client_ref).filter(Boolean));
  const local = queue.filter((s) => s.store_id === storeId && s.user_id === userId && s.sold_at >= start && s.sold_at < end && !refs.has(s.client_ref));
  return { count: sales.length + local.length, total: [...sales, ...local].reduce((n, s) => n + Number(s.total), 0), localCount: local.length };
}