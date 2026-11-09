import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet } from "@/lib/local-db";
import { networkRead, setInternetAvailable } from "@/lib/connectivity";
import { currentScope, isNetworkError } from "@/lib/offline";
import { scopedStorageKey, type StoreScope } from "@/lib/store-scope";

/** A day settlement saved on this device while offline; the latest save for a day wins. */
export type PendingSettlement = { store_id: string; day: string; lines: unknown[]; notes: string; settled_by: string; settled_at: string };
const KEY = "tilla-pending-settlements";
const db = supabase as unknown as { from: (t: string) => any };

export async function readPendingSettlements(scope: StoreScope | null = currentScope()): Promise<PendingSettlement[]> {
  if (!scope) return [];
  return (await idbGet<PendingSettlement[]>(scopedStorageKey(KEY, scope)).catch(() => undefined)) ?? [];
}

export async function queueSettlement(s: PendingSettlement) {
  const scope = currentScope();
  if (!scope) throw new Error("Wait for your store account to load");
  const list = (await readPendingSettlements(scope)).filter((x) => x.day !== s.day);
  await idbSet(scopedStorageKey(KEY, scope), [...list, s]);
  window.dispatchEvent(new Event("tilla-queue"));
}

export async function uploadSettlement(s: PendingSettlement, timeout = 8000) {
  return networkRead(() => db.from("daily_settlements").upsert(s, { onConflict: "store_id,day" }), timeout) as Promise<{ error: { message: string } | null }>;
}

/** Upload settlements saved offline. Returns false if the internet dropped. */
export async function syncSettlements(scope: StoreScope, timeout: number): Promise<boolean> {
  const list = await readPendingSettlements(scope);
  if (!list.length) return true;
  const left: PendingSettlement[] = [];
  let ok = true;
  for (const s of list) {
    if (!ok) { left.push(s); continue; }
    const { error } = await uploadSettlement(s, timeout);
    if (error && isNetworkError(error)) { setInternetAvailable(false); ok = false; left.push(s); continue; }
    if (error) { window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "settlement", network: false }); left.push(s); }
  }
  await idbSet(scopedStorageKey(KEY, scope), left);
  return ok;
}
