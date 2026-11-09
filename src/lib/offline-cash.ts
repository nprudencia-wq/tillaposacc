import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet } from "@/lib/local-db";
import { currentScope, isNetworkError } from "@/lib/offline";
import { networkRead, setInternetAvailable } from "@/lib/connectivity";
import { scopedStorageKey, type StoreScope } from "@/lib/store-scope";
import type { Currency } from "@/lib/pos";

/** A safe drop, payout or paid-in recorded on this till; kept after upload so offline X/Z reports stay right. */
export type QueuedCashMovement = {
  client_ref: string; shift_id: string; type: "cash_drop" | "paid_out" | "paid_in"; currency: Currency;
  amount: number; reason: string; at: string; uploaded?: boolean; uploaded_at?: string; error?: string;
};

const KEY = "tilla-offline-cash-movements";

export async function readCashMovements(scope: StoreScope | null = currentScope()): Promise<QueuedCashMovement[]> {
  if (!scope) return [];
  return (await idbGet<QueuedCashMovement[]>(scopedStorageKey(KEY, scope)).catch(() => undefined)) ?? [];
}
async function write(scope: StoreScope, list: QueuedCashMovement[]) {
  const pending = list.filter((m) => !m.uploaded);
  const done = list.filter((m) => m.uploaded).slice(-200);
  await idbSet(scopedStorageKey(KEY, scope), [...done, ...pending]);
  window.dispatchEvent(new Event("tilla-queue"));
}

export async function enqueueCashMovement(m: Omit<QueuedCashMovement, "client_ref" | "at">) {
  const scope = currentScope();
  if (!scope) throw new Error("Wait for your store account to load");
  if (!(m.amount > 0) || !Number.isFinite(m.amount)) throw new Error("Amount must be more than zero");
  if (!m.reason.trim()) throw new Error("A reason is required");
  const list = await readCashMovements(scope);
  await write(scope, [...list, { ...m, amount: Math.round(m.amount * 100) / 100, client_ref: `MOV-${crypto.randomUUID()}`, at: new Date().toISOString() }]);
}

export async function pendingCashMovements() {
  return (await readCashMovements()).filter((m) => !m.uploaded);
}

/** Movements a shift report downloaded at `checkedAt` does not include yet. */
export function movementsMissingFrom(list: QueuedCashMovement[], shiftId: string, checkedAt: string | null) {
  return list.filter((m) => m.shift_id === shiftId && (!m.uploaded || !checkedAt || (m.uploaded_at ?? "") > checkedAt));
}

/** Upload pending movements (optionally only one shift's). Returns false if the internet dropped. */
export async function syncCashMovements(scope: StoreScope, timeout: number, shiftId?: string): Promise<boolean> {
  const list = await readCashMovements(scope);
  let changed = false, ok = true;
  for (const m of list) {
    if (m.uploaded || (shiftId && m.shift_id !== shiftId)) continue;
    const { error } = await networkRead(() => supabase.rpc("record_offline_cash_movement", {
      p_client_ref: m.client_ref, p_shift: m.shift_id, p_type: m.type, p_currency: m.currency, p_amount: m.amount, p_reason: m.reason, p_at: m.at,
    }), timeout);
    if (error && isNetworkError(error)) { setInternetAvailable(false); ok = false; break; }
    if (error) window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "cash_movement", network: false });
    Object.assign(m, error ? { error: error.message } : { uploaded: true, uploaded_at: new Date().toISOString(), error: undefined });
    changed = true;
  }
  if (changed) await write(scope, list);
  return ok;
}
