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
const SHIFTS_KEY = "tilla-offline-shifts";
let shiftsMem: LocalShift[] = [];
let ready: Promise<void> = Promise.resolve();

/** A shift opened or closed on this device that the cloud may not know about yet. */
export type LocalShift = {
  id: string; shift_number: string; opened_at: string; status: "open" | "closed";
  opening_float_usd: number; opening_float_zig: number; opening_float_zar: number;
  closed_at?: string; count?: { usd: number; zig: number; zar: number; notes: string };
  opened_synced: boolean; closed_synced: boolean; error?: string | undefined;
};

export function setOfflineScope(scope: StoreScope | null) {
  const prev = activeScope;
  activeScope = scope;
  if (!scope) { queueMem = []; shiftsMem = []; queueKeyLoaded = null; return; }
  if (prev?.storeId === scope.storeId && prev?.userId === scope.userId) return;
  queueMem = []; shiftsMem = []; queueKeyLoaded = null;
  ready = hydrateQueue(scope);
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
  const shiftKey = scopedStorageKey(SHIFTS_KEY, scope);
  let storedShifts: LocalShift[] = [];
  try { storedShifts = (await idbGet<LocalShift[]>(shiftKey)) ?? []; } catch { /* unavailable */ }
  if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) return;
  const ids = new Set(shiftsMem.map((x) => x.id));
  shiftsMem = [...storedShifts.filter((x) => !ids.has(x.id)), ...shiftsMem];
  queueKeyLoaded = key;
  await persistQueue(key);
  await persistShifts();
  if (legacy.length) try { localStorage.removeItem(key); } catch { /* ignore */ }
  window.dispatchEvent(new Event("tilla-queue"));
}

async function persistQueue(key: string) {
  try { await idbSet(key, queueMem); }
  catch { try { localStorage.setItem(key, JSON.stringify(queueMem)); } catch { /* quota */ } }
}

async function persistShifts() {
  if (!activeScope || !queueKeyLoaded) return;
  const key = scopedStorageKey(SHIFTS_KEY, activeScope);
  try { await idbSet(key, shiftsMem); }
  catch { try { localStorage.setItem(key, JSON.stringify(shiftsMem)); } catch { /* quota */ } }
}
function writeShifts(list: LocalShift[]) {
  shiftsMem = list;
  void persistShifts();
  window.dispatchEvent(new Event("tilla-queue"));
}

/** The shift this device treats as open: a device shift wins over the cloud copy until it is uploaded. */
export async function deviceShiftState(): Promise<{ open: LocalShift | null; closedIds: string[] }> {
  await ready;
  return {
    open: shiftsMem.find((x) => x.status === "open") ?? null,
    closedIds: shiftsMem.filter((x) => x.status === "closed").map((x) => x.id),
  };
}
export function pendingShiftCount() { return shiftsMem.filter((x) => !x.opened_synced || (x.status === "closed" && !x.closed_synced)).length; }

/** Open a shift on this device without internet. Uploaded automatically later. */
export function openDeviceShift(f: { usd: number; zig: number; zar: number }): LocalShift {
  if (!activeScope) throw new Error("Wait for your store account to load");
  if (shiftsMem.some((x) => x.status === "open")) throw new Error("You already have an open shift");
  const id = crypto.randomUUID();
  const shift: LocalShift = {
    id, shift_number: `OFF-${id.slice(0, 6).toUpperCase()}`, opened_at: new Date().toISOString(), status: "open",
    opening_float_usd: f.usd, opening_float_zig: f.zig, opening_float_zar: f.zar, opened_synced: false, closed_synced: false,
  };
  writeShifts([...shiftsMem, shift]);
  return shift;
}

/** Close a shift (device or cloud) on this device; the count uploads after its sales. */
export function closeDeviceShift(base: { id: string; shift_number: string; opened_at: string }, count: { usd: number; zig: number; zar: number; notes: string }) {
  if (!activeScope) throw new Error("Wait for your store account to load");
  const existing = shiftsMem.find((x) => x.id === base.id);
  const closed: LocalShift = existing
    ? { ...existing, status: "closed", closed_at: new Date().toISOString(), count }
    : { ...base, status: "closed", closed_at: new Date().toISOString(), count, opening_float_usd: 0, opening_float_zig: 0, opening_float_zar: 0, opened_synced: true, closed_synced: false };
  writeShifts([...shiftsMem.filter((x) => x.id !== base.id), closed]);
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

type Step = "ok" | "stop";

async function uploadSale(s: QueuedSale, scope: StoreScope): Promise<Step | "failed"> {
  if (!belongsToScope(s, scope)) return "failed";
  const { error } = await supabase.rpc("complete_offline_sale", {
    p_client_ref: s.client_ref, p_items: s.items as never, p_payments: s.payments as never,
    p_discount: s.discount, p_currency: s.currency, p_sold_at: s.sold_at, p_shift: s.shift_id,
  });
  if (activeScope?.storeId !== scope.storeId || activeScope?.userId !== scope.userId) return "stop";
  if (error && isNetworkError(error)) return "stop";
  const rest = readQueue().filter((x) => x.client_ref !== s.client_ref);
  if (error) { writeQueue([...rest, { ...s, error: error.message }]); return "failed"; }
  writeQueue(rest); return "ok";
}

/**
 * Upload everything made offline, in order: each device shift opens, then its sales,
 * then its close. The server ignores repeats, so retries are always safe.
 */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const scope = activeScope;
  if (syncing || !navigator.onLine || !scope) return { synced: 0, failed: 0 };
  setSyncing(true);
  let synced = 0, failed = 0, stopped = false;
  const sales = async (filter: (s: QueuedSale) => boolean) => {
    for (const s of readQueue().filter((x) => filter(x) && !x.error)) {
      const r = await uploadSale(s, scope);
      if (r === "stop") { stopped = true; return; }
      if (r === "ok") synced++; else failed++;
    }
  };
  const patch = (id: string, p: Partial<LocalShift>) => writeShifts(shiftsMem.map((x) => (x.id === id ? { ...x, ...p } : x)));
  try {
    await ready;
    for (const sh of [...shiftsMem]) {
      if (stopped) break;
      if (!sh.opened_synced) {
        const { error } = await supabase.rpc("open_offline_shift", {
          p_id: sh.id, p_opened_at: sh.opened_at, p_float_usd: sh.opening_float_usd, p_float_zig: sh.opening_float_zig, p_float_zar: sh.opening_float_zar,
        });
        if (error) { if (!isNetworkError(error)) patch(sh.id, { error: error.message }); stopped = true; break; }
        patch(sh.id, { opened_synced: true, error: undefined });
      }
      await sales((x) => x.shift_id === sh.id);
      if (stopped) break;
      if (sh.status === "closed" && sh.count && !sh.closed_synced) {
        if (readQueue().some((x) => x.shift_id === sh.id && !x.error)) { stopped = true; break; }
        const { error } = await supabase.rpc("close_offline_shift", {
          p_id: sh.id, p_closed_at: sh.closed_at!, p_actual_usd: sh.count.usd, p_actual_zig: sh.count.zig, p_actual_zar: sh.count.zar, p_notes: sh.count.notes,
        });
        if (error) { if (!isNetworkError(error)) patch(sh.id, { error: error.message }); stopped = true; break; }
        writeShifts(shiftsMem.filter((x) => x.id !== sh.id));
      }
    }
    if (!stopped) await sales(() => true);
    // Retry earlier rejected sales once more only when nothing else is waiting.
    if (!stopped) for (const s of readQueue().filter((x) => x.error)) {
      const r = await uploadSale(s, scope); if (r === "stop") break; if (r === "ok") synced++;
    }
  } finally { setSyncing(false); }
  return { synced, failed };
}

/** Errors on shifts waiting to upload, for the offline bar. */
export function shiftErrors() { return shiftsMem.filter((x) => x.error).map((x) => `${x.shift_number}: ${x.error}`); }
