import { supabase } from "@/integrations/supabase/client";
import { requireFullPayment, type Payment, type Currency } from "@/lib/pos";
import { belongsToScope, scopedStorageKey, type StoreScope } from "@/lib/store-scope";
import { idbGet, idbSet, idbSetMany } from "@/lib/local-db";
import { mergeQueues } from "@/lib/queue-merge";
import { internetAvailable, networkRead, setInternetAvailable } from "@/lib/connectivity";
import type { ReceiptData } from "@/components/Receipt";

// Browser-only helpers: call from effects, handlers or query functions (never at module scope).

const CACHE_PREFIX = "tilla-cache:";
const QUEUE_KEY = "tilla-offline-sales";
let activeScope: StoreScope | null = null;

let queueMem: QueuedSale[] = [];
let queueKeyLoaded: string | null = null;
let queueReady: Promise<void> = Promise.resolve();
let writes: Promise<unknown> = Promise.resolve();
const RECEIPTS_KEY = "tilla-local-receipts";
const UPLOADED_KEY = "tilla-uploaded-sales";
function sameScope(scope: StoreScope) { return activeScope?.storeId === scope.storeId && activeScope?.userId === scope.userId; }
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const result = writes.then(run, run);
  writes = result.catch(() => {});
  return result;
}

export function setOfflineScope(scope: StoreScope | null) {
  const prev = activeScope;
  activeScope = scope;
  if (!scope) { queueMem = []; queueKeyLoaded = null; return; }
  if (prev?.storeId === scope.storeId && prev?.userId === scope.userId) return;
  queueMem = []; queueKeyLoaded = null;
  queueReady = hydrateQueue(scope);
  void queueReady.catch(() => {});
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
  await idbSet(key, queueMem);
}

export function deviceStorageKey(key: string) {
  if (!activeScope) throw new Error("Wait for your store account to load");
  return scopedStorageKey(key, activeScope);
}

export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|network request timed out/i.test(msg);
}

/** Run a fetch; remember the result; fall back to the remembered copy when offline. */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const scope = activeScope;
  const cacheKey = scope ? scopedStorageKey(CACHE_PREFIX + key, scope) : null;
  const readLocal = async () => {
    if (!cacheKey) return undefined;
    const local = await idbGet<T>(cacheKey).catch(() => undefined);
    if (local !== undefined) return local;
    const raw = localStorage.getItem(cacheKey);
    return raw ? JSON.parse(raw) as T : undefined;
  };
  if (!internetAvailable()) {
    const local = await readLocal();
    if (local !== undefined) return local;
    throw new Error("No saved copy on this till. Connect once to download it.");
  }
  try {
    const v = await networkRead(fn);
    if (scope && !sameScope(scope)) throw new Error("Cashier changed. Sign back in before loading this till.");
    setInternetAvailable(true);
    if (cacheKey) await idbSet(cacheKey, v).catch(() => { /* quota */ });
    return v;
  } catch (e) {
    if (cacheKey && isNetworkError(e)) {
      setInternetAvailable(false);
      const local = await readLocal();
      if (local !== undefined) return local;
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
  receipt?: ReceiptData;
};

export function readQueue(): QueuedSale[] {
  if (!activeScope) return [];
  return queueMem;
}
/** Device history bridges the time between an upload and the next report download. */
export async function deviceSales(): Promise<QueuedSale[]> {
  await queueReady;
  const scope = activeScope;
  if (!scope) return [];
  const history = (await idbGet<QueuedSale[]>(scopedStorageKey(UPLOADED_KEY, scope))) ?? [];
  return sameScope(scope) ? mergeQueues(history, readQueue()) : [];
}
async function writeQueue(q: QueuedSale[]) {
  const key = deviceStorageKey(QUEUE_KEY);
  await idbSet(key, q);
  queueMem = q;
  window.dispatchEvent(new Event("tilla-queue"));
}
export async function enqueueSale(s: QueuedSale) {
  requireFullPayment(s.total, s.payments, s.rate ?? 1, s.rand_rate ?? 0);
  const scope = activeScope;
  if (!scope) throw new Error("No store selected for this sale");
  await queueReady;
  await serialized(async () => {
    if (!sameScope(scope)) throw new Error("Cashier changed. Sign back in before saving this sale.");
    const q = mergeQueues(queueMem, [{ ...s, store_id: scope.storeId, user_id: scope.userId }]);
    const entries: [string, unknown][] = [[scopedStorageKey(QUEUE_KEY, scope), q]];
    if (s.receipt) {
      const key = scopedStorageKey(RECEIPTS_KEY, scope);
      const receipts = (await idbGet<ReceiptData[]>(key)) ?? [];
      entries.push([key, [s.receipt, ...receipts.filter((r) => r.sale_number !== s.client_ref)].slice(0, 500)]);
    }
    await idbSetMany(entries);
    if (!sameScope(scope)) return;
    queueMem = q;
    window.dispatchEvent(new Event("tilla-queue"));
  });
}
export async function localReceipts(): Promise<ReceiptData[]> {
  if (!activeScope) return [];
  return (await idbGet<ReceiptData[]>(deviceStorageKey(RECEIPTS_KEY))) ?? [];
}
export function stockAfterQueue<T extends { id: string; stock: number | string }>(products: T[]): T[] {
  return products.map((p) => ({ ...p, stock: Number(p.stock) - readQueue().reduce((sum, sale) => sum + sale.items.filter((i) => i.product_id === p.id).reduce((n, i) => n + i.quantity, 0), 0) }));
}
export async function hasPendingUploads() {
  await queueReady;
  return readQueue().length > 0 || !!(await readLocalShift()) || !!(await readPendingClose());
}
async function updateUploadedSale(scope: StoreScope, s: QueuedSale, error?: string) {
  await serialized(async () => {
    if (!sameScope(scope)) return;
    if (error) { await writeQueue(readQueue().map((x) => x.client_ref === s.client_ref ? { ...x, error } : x)); return; }
    const key = scopedStorageKey(UPLOADED_KEY, scope);
    const history = (await idbGet<QueuedSale[]>(key)) ?? [];
    const q = readQueue().filter((x) => x.client_ref !== s.client_ref);
    await idbSetMany([[key, mergeQueues(history, [s])], [scopedStorageKey(QUEUE_KEY, scope), q]]);
    if (!sameScope(scope)) return;
    queueMem = q;
    window.dispatchEvent(new Event("tilla-queue"));
  });
}

let syncing = false;
let pendingCloseUploaded = false;
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
  if (await readLocalShift()) throw new Error("A shift is already open on this till");
  if (await readPendingClose()) throw new Error("Reconnect to upload the previous shift before opening another");
  const s: LocalShift = {
    id: crypto.randomUUID(), shift_number: "Offline shift", status: "open", opened_at: new Date().toISOString(),
    cashier_id: activeScope.userId, opening_float_usd: floats.usd, opening_float_zig: floats.zig, opening_float_zar: floats.zar, offline: true,
  };
  await idbSet(scopedStorageKey(SHIFT_KEY, activeScope), s);
  window.dispatchEvent(new Event("tilla-queue"));
  return s;
}

async function syncLocalShift(scope: StoreScope, timeout: number): Promise<boolean> {
  const s = await readLocalShift();
  if (!s) return true;
  const { error } = await networkRead(() => supabase.rpc("open_offline_shift", {
    p_id: s.id, p_opened_at: s.opened_at, p_float_usd: s.opening_float_usd, p_float_zig: s.opening_float_zig, p_float_zar: s.opening_float_zar,
  }), timeout);
  if (error) {
    window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "shift_open", network: isNetworkError(error) });
    return false;
  }
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
  window.__lovableEvents?.track?.("project.offline_shift_closed", { opened_offline: !!p.local_shift });
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
async function syncPendingClose(scope: StoreScope, timeout: number): Promise<boolean> {
  const p = await readPendingClose();
  if (!p) return true;
  if (p.local_shift) {
    const ls = p.local_shift;
    const { error } = await networkRead(() => supabase.rpc("open_offline_shift", {
      p_id: ls.id, p_opened_at: ls.opened_at, p_float_usd: ls.opening_float_usd, p_float_zig: ls.opening_float_zig, p_float_zar: ls.opening_float_zar,
    }), timeout);
    if (error) {
      window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "shift_open", network: isNetworkError(error) });
      return false;
    }
  }
  for (const s of readQueue().filter((x) => x.shift_id === p.shift_id)) {
    if (!sameScope(scope) || !belongsToScope(s, scope)) return false;
    const { error } = await networkRead(() => uploadSale(s), timeout);
    if (error) window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "sale", network: isNetworkError(error) });
    if (error && isNetworkError(error)) return false;
    await updateUploadedSale(scope, s, error?.message);
  }
  // Rejected sales remain durable for retry, but must not block later sales.
  // Never close the shift until every sale belonging to it has uploaded.
  if (!sameScope(scope) || readQueue().some((s) => s.shift_id === p.shift_id)) return false;
  const { error } = await networkRead(() => supabase.rpc("close_offline_shift", {
    p_id: p.shift_id, p_closed_at: p.closed_at, p_actual_usd: p.usd, p_actual_zig: p.zig, p_actual_zar: p.zar, p_notes: p.notes,
  }), timeout);
  if (error) {
    window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "shift_close", network: isNetworkError(error) });
    return false;
  }
  pendingCloseUploaded = true;
  if (activeScope?.storeId === scope.storeId && activeScope?.userId === scope.userId) {
    try { await idbSet(scopedStorageKey(CLOSE_KEY, scope), null); } catch { /* retry is harmless */ }
  }
  return true;
}

/** Upload the offline shift (if any), then queued sales one by one. The server ignores duplicates, so retries are safe. */
export async function syncQueue(timeout = 5000): Promise<{ synced: number; failed: number }> {
  const scope = activeScope;
  if (syncing || !navigator.onLine || !scope) return { synced: 0, failed: 0 };
  setSyncing(true);
  let synced = 0, failed = 0, complete = false;
  pendingCloseUploaded = false;
  try {
    await queueReady;
    const { error: reachError } = await networkRead(() => supabase.from("store_memberships").select("store_id").eq("user_id", scope.userId).single(), timeout);
    if (reachError) { if (isNetworkError(reachError)) setInternetAvailable(false); return { synced, failed }; }
    setInternetAvailable(true);
    // A shift closed offline goes first (its sales, then its count), so the next shift can't merge into it.
    if (!(await syncPendingClose(scope, timeout))) return { synced, failed };
    // Sales need their shift on the server first.
    if (!(await syncLocalShift(scope, timeout))) return { synced, failed };
    complete = true;
    for (const s of readQueue()) {
      if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) break;
      if (!belongsToScope(s, scope)) { failed++; continue; }
      const { error } = await networkRead(() => uploadSale(s), timeout);
      if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) break;
      if (error) window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "sale", network: isNetworkError(error) });
      if (error && isNetworkError(error)) { setInternetAvailable(false); complete = false; break; }
      await updateUploadedSale(scope, s, error?.message);
      if (error) { failed++; complete = false; continue; }
      synced++;
    }
  } catch (e) {
    if (isNetworkError(e)) setInternetAvailable(false);
    else failed++;
  } finally {
    setSyncing(false);
    // Only report a completed sync when something actually uploaded, so idle 15-second checks stay silent.
    if (complete && (synced > 0 || pendingCloseUploaded)) {
      window.__lovableEvents?.track?.("project.offline_sync_completed", { synced, failed, shift_close_uploaded: pendingCloseUploaded });
    }
  }
  return { synced, failed };
}
