import { supabase } from "@/integrations/supabase/client";
import type { Payment, Currency } from "@/lib/pos";
import { belongsToScope, scopedStorageKey, type StoreScope } from "@/lib/store-scope";

// Browser-only helpers: call from effects, handlers or query functions (never at module scope).

const CACHE_PREFIX = "tilla-cache:";
const QUEUE_KEY = "tilla-offline-sales";
let activeScope: StoreScope | null = null;

export function setOfflineScope(scope: StoreScope | null) {
  activeScope = scope;
}

export function deviceStorageKey(key: string) {
  if (!activeScope) throw new Error("Wait for your store account to load");
  return scopedStorageKey(key, activeScope);
}

export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg);
}

/** Run a fetch; remember the result; fall back to the remembered copy when offline. */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const scope = activeScope;
  const cacheKey = scope ? scopedStorageKey(CACHE_PREFIX + key, scope) : null;
  try {
    const v = await fn();
    try { if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(v)); } catch { /* quota */ }
    return v;
  } catch (e) {
    const raw = cacheKey ? localStorage.getItem(cacheKey) : null;
    if (raw && isNetworkError(e)) return JSON.parse(raw) as T;
    throw e;
  }
}

export type QueuedSale = {
  store_id?: string;
  user_id?: string;
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
  if (!activeScope) return [];
  try { return JSON.parse(localStorage.getItem(deviceStorageKey(QUEUE_KEY)) || "[]"); } catch { return []; }
}
function writeQueue(q: QueuedSale[]) {
  localStorage.setItem(deviceStorageKey(QUEUE_KEY), JSON.stringify(q));
  window.dispatchEvent(new Event("tilla-queue"));
}
export function enqueueSale(s: QueuedSale) {
  if (!activeScope) throw new Error("No store selected for this sale");
  writeQueue([...readQueue(), { ...s, store_id: activeScope.storeId, user_id: activeScope.userId }]);
}

let syncing = false;
/** True while queued sales are being uploaded, so the till can show "Syncing". */
export function isSyncing() { return syncing; }
function setSyncing(v: boolean) {
  syncing = v;
  window.dispatchEvent(new Event("tilla-sync"));
}

/** Upload queued sales one by one. The server ignores duplicates, so retries are safe. */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const scope = activeScope;
  if (syncing || !navigator.onLine || !scope) return { synced: 0, failed: 0 };
  setSyncing(true);
  let synced = 0, failed = 0;
  try {
    for (const s of readQueue()) {
      if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) break;
      if (!belongsToScope(s, scope)) { failed++; continue; }
      const { error } = await supabase.rpc("complete_offline_sale", {
        p_client_ref: s.client_ref, p_items: s.items as never, p_payments: s.payments as never,
        p_discount: s.discount, p_currency: s.currency, p_sold_at: s.sold_at, p_shift: s.shift_id,
      });
      if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) break;
      if (error && isNetworkError(error)) break;
      const rest = readQueue().filter((x) => x.client_ref !== s.client_ref);
      if (error) { failed++; writeQueue([...rest, { ...s, error: error.message }]); }
      else { synced++; writeQueue(rest); }
    }
  } finally { setSyncing(false); }
  return { synced, failed };
}
