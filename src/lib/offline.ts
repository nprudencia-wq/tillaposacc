import { supabase } from "@/integrations/supabase/client";
import type { Payment, Currency } from "@/lib/pos";

// Browser-only helpers: call from effects, handlers or query functions (never at module scope).

const CACHE_PREFIX = "tilla-cache:";
const QUEUE_KEY = "tilla-offline-sales";

export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg);
}

/** Run a fetch; remember the result; fall back to the remembered copy when offline. */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const v = await fn();
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(v)); } catch { /* quota */ }
    return v;
  } catch (e) {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw && isNetworkError(e)) return JSON.parse(raw) as T;
    throw e;
  }
}

export type QueuedSale = {
  client_ref: string;
  sold_at: string;
  shift_id: string;
  currency: Currency;
  discount: number;
  items: { product_id: string; quantity: number; unit_price?: number }[];
  rate?: number;
  payments: Payment[];
  total: number;
  error?: string;
};

export function readQueue(): QueuedSale[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function writeQueue(q: QueuedSale[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  window.dispatchEvent(new Event("tilla-queue"));
}
export function enqueueSale(s: QueuedSale) { writeQueue([...readQueue(), s]); }

let syncing = false;
/** Upload queued sales one by one. The server ignores duplicates, so retries are safe. */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing || !navigator.onLine) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0, failed = 0;
  try {
    for (const s of readQueue()) {
      const { error } = await supabase.rpc("complete_offline_sale", {
        p_client_ref: s.client_ref, p_items: s.items as never, p_payments: s.payments as never,
        p_discount: s.discount, p_currency: s.currency, p_sold_at: s.sold_at, p_shift: s.shift_id,
      });
      if (error && isNetworkError(error)) break;
      const rest = readQueue().filter((x) => x.client_ref !== s.client_ref);
      if (error) { failed++; writeQueue([...rest, { ...s, error: error.message }]); }
      else { synced++; writeQueue(rest); }
    }
  } finally { syncing = false; }
  return { synced, failed };
}
