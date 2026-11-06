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

// ---- Shifts opened with no internet ----
export type LocalShift = {
  id: string; shift_number: string; status: "open"; opened_at: string; cashier_id: string;
  opening_float_usd: number; opening_float_zig: number; opening_float_zar: number; offline: true;
};
const SHIFT_KEY = "tilla-offline-shift";

export async function readLocalShift(): Promise<LocalShift | null> {
  if (!activeScope) return null;
  try { return (await idbGet<LocalShift>(scopedStorageKey(SHIFT_KEY, activeScope))) ?? null; } catch { return null; }
}

/** Open a shift on this device only. It uploads (with its original time) before any of its sales. */
export async function openLocalShift(floats: { usd: number; zig: number; zar: number }): Promise<LocalShift> {
  if (!activeScope) throw new Error("Wait for your store account to load");
  const s: LocalShift = {
    id: crypto.randomUUID(), shift_number: "Offline shift", status: "open", opened_at: new Date().toISOString(),
    cashier_id: activeScope.userId, opening_float_usd: floats.usd, opening_float_zig: floats.zig, opening_float_zar: floats.zar, offline: true,
  };
  await idbSet(scopedStorageKey(SHIFT_KEY, activeScope), s);
  window.dispatchEvent(new Event("tilla-queue"));
  return s;
}

async function syncLocalShift(scope: StoreScope): Promise<boolean> {
  const s = await readLocalShift();
  if (!s) return true;
  const { error } = await supabase.rpc("open_offline_shift", {
    p_id: s.id, p_opened_at: s.opened_at, p_float_usd: s.opening_float_usd, p_float_zig: s.opening_float_zig, p_float_zar: s.opening_float_zar,
  });
  if (error) return false;
  if (activeScope?.storeId === scope.storeId && activeScope?.userId === scope.userId) {
    try { await idbSet(scopedStorageKey(SHIFT_KEY, scope), null); } catch { /* retry later is harmless */ }
  }
  return true;
}

// ---- Shifts closed with no internet ----
export type PendingClose = {
  shift_id: string; closed_at: string; usd: number; zig: number; zar: number; notes: string;
  /** Set when the shift itself was opened offline and never uploaded. */
  local_shift: LocalShift | null;
};
const CLOSE_KEY = "tilla-offline-shift-close";

export async function readPendingClose(): Promise<PendingClose | null> {
  if (!activeScope) return null;
  try { return (await idbGet<PendingClose>(scopedStorageKey(CLOSE_KEY, activeScope))) ?? null; } catch { return null; }
}

/** Close the current shift on this device. Its sales and the cash count upload later, in order. */
export async function closeShiftOffline(shiftId: string, count: { usd: number; zig: number; zar: number; notes: string }): Promise<PendingClose> {
  if (!activeScope) throw new Error("Wait for your store account to load");
  if (await readPendingClose()) throw new Error("A previous offline shift is still waiting to upload");
  const local = await readLocalShift();
  const p: PendingClose = { shift_id: shiftId, closed_at: new Date().toISOString(), ...count, local_shift: local?.id === shiftId ? local : null };
  await idbSet(scopedStorageKey(CLOSE_KEY, activeScope), p);
  if (p.local_shift) await idbSet(scopedStorageKey(SHIFT_KEY, activeScope), null);
  window.dispatchEvent(new Event("tilla-queue"));
  return p;
}

async function uploadSale(s: QueuedSale) {
  return supabase.rpc("complete_offline_sale", {
    p_client_ref: s.client_ref, p_items: s.items as never, p_payments: s.payments as never,
    p_discount: s.discount, p_currency: s.currency, p_sold_at: s.sold_at, p_shift: s.shift_id,
  });
}

/** Uploads an offline-closed shift: its opening (if offline), its sales, then the count. Returns false to retry later. */
async function syncPendingClose(scope: StoreScope): Promise<boolean> {
  const p = await readPendingClose();
  if (!p) return true;
  if (p.local_shift) {
    const ls = p.local_shift;
    const { error } = await supabase.rpc("open_offline_shift", {
      p_id: ls.id, p_opened_at: ls.opened_at, p_float_usd: ls.opening_float_usd, p_float_zig: ls.opening_float_zig, p_float_zar: ls.opening_float_zar,
    });
    if (error) return false;
  }
  for (const s of readQueue().filter((x) => x.shift_id === p.shift_id)) {
    if (!belongsToScope(s, scope)) continue;
    const { error } = await uploadSale(s);
    if (error && isNetworkError(error)) return false;
    const rest = readQueue().filter((x) => x.client_ref !== s.client_ref);
    if (error) { writeQueue([...rest, { ...s, error: error.message }]); return false; }
    writeQueue(rest);
  }
  const { error } = await supabase.rpc("close_offline_shift", {
    p_id: p.shift_id, p_closed_at: p.closed_at, p_actual_usd: p.usd, p_actual_zig: p.zig, p_actual_zar: p.zar, p_notes: p.notes,
  });
  if (error) return false;
  if (activeScope?.storeId === scope.storeId && activeScope?.userId === scope.userId) {
    try { await idbSet(scopedStorageKey(CLOSE_KEY, scope), null); } catch { /* retry is harmless */ }
  }
  return true;
}

/** Upload the offline shift (if any), then queued sales one by one. The server ignores duplicates, so retries are safe. */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const scope = activeScope;
  if (syncing || !navigator.onLine || !scope) return { synced: 0, failed: 0 };
  setSyncing(true);
  let synced = 0, failed = 0;
  try {
    // A shift closed offline goes first (its sales, then its count), so the next shift can't merge into it.
    if (!(await syncPendingClose(scope))) return { synced, failed };
    // Sales need their shift on the server first.
    if (!(await syncLocalShift(scope))) return { synced, failed };
    for (const s of readQueue()) {
      if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) break;
      if (!belongsToScope(s, scope)) { failed++; continue; }
      const { error } = await uploadSale(s);
      if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) break;
      if (error && isNetworkError(error)) break;
      const rest = readQueue().filter((x) => x.client_ref !== s.client_ref);
      if (error) { failed++; writeQueue([...rest, { ...s, error: error.message }]); }
      else { synced++; writeQueue(rest); }
    }
  } finally { setSyncing(false); }
  return { synced, failed };
}
