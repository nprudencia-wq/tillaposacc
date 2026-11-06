import { supabase } from "@/integrations/supabase/client";
import type { Payment, Currency } from "@/lib/pos";
import { belongsToScope, scopedStorageKey, type StoreScope } from "@/lib/store-scope";
import { idbGet, idbSet } from "@/lib/local-db";
import { mergeQueues } from "@/lib/queue-merge";

// Browser-only helpers: call from effects, handlers or query functions (never at module scope).

const CACHE_PREFIX = "tilla-cache:";
const QUEUE_KEY = "tilla-offline-sales";
let activeScope: StoreScope | null = null;

let queueMem: QueuedSale[] = [];
let queueKeyLoaded: string | null = null;

export function setOfflineScope(scope: StoreScope | null) {
  const prev = activeScope;
  activeScope = scope;
  if (!scope) { queueMem = []; queueKeyLoaded = null; return; }
  if (prev?.storeId === scope.storeId && prev?.userId === scope.userId) return;
  queueMem = []; queueKeyLoaded = null;
  void hydrateQueue(scope);
}

/** Load this cashier's queue from IndexedDB, moving any older browser-storage copy across. */
async function hydrateQueue(scope: StoreScope) {
  const key = scopedStorageKey(QUEUE_KEY, scope);
  let stored: QueuedSale[] = [];
  try { stored = (await idbGet<QueuedSale[]>(key)) ?? []; } catch { /* unavailable */ }
  let legacy: QueuedSale[] = [];
  try { legacy = JSON.parse(localStorage.getItem(key) || "[]"); } catch { /* none */ }
  if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) return;
  queueMem = mergeQueues(mergeQueues(stored, legacy), queueMem);
  queueKeyLoaded = key;
  await persistQueue(key);
  if (legacy.length) try { localStorage.removeItem(key); } catch { /* ignore */ }
  window.dispatchEvent(new Event("tilla-queue"));
}

async function persistQueue(key: string) {
  try { await idbSet(key, queueMem); }
  catch { try { localStorage.setItem(key, JSON.stringify(queueMem)); } catch { /* quota */ } }
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
    if (cacheKey) void idbSet(cacheKey, v).catch(() => { /* quota */ });
    return v;
  } catch (e) {
    if (cacheKey && isNetworkError(e)) {
      const local = await idbGet<T>(cacheKey).catch(() => undefined);
      if (local !== undefined) return local;
      const raw = localStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw) as T;
    }
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
  rand_rate?: number;
  payments: Payment[];
  total: number;
  error?: string;
};

export function readQueue(): QueuedSale[] {
  if (!activeScope) return [];
  return queueMem;
}
function writeQueue(q: QueuedSale[]) {
  const key = deviceStorageKey(QUEUE_KEY);
  queueMem = q;
  if (queueKeyLoaded === key) void persistQueue(key);
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
