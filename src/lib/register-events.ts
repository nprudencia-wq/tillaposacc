import { supabase } from "@/integrations/supabase/client";
import { currentScope } from "@/lib/offline";
import { idbEntries, idbSet, idbDelete } from "@/lib/local-db";
import { scopedStorageKey, type StoreScope } from "@/lib/store-scope";
import { readRegister, type RegisterIdentity } from "@/lib/register";
import { networkRead } from "@/lib/connectivity";

export type AuditAction = "VOID_ITEM" | "PRICE_OVERRIDE" | "NO_SALE_DRAWER_OPEN" | "REFUND" | "SHIFT_OPEN" | "SHIFT_CLOSE";
type EventRecord = RegisterIdentity & { id: string; at: string; action?: AuditAction; details?: Record<string, unknown>; category?: "hardware" | "sync" | "runtime"; message?: string };
const prefix = (scope: StoreScope) => scopedStorageKey("tilla-register-events", scope) + ":";
export function auditEntry(action: AuditAction, details: Record<string, unknown> = {}): [string, EventRecord] | null {
  const scope = currentScope();
  const identity = scope ? readRegister(scope.storeId) : null;
  if (!scope || !identity) return null; // Existing queues remain upgrade-compatible.
  const id = crypto.randomUUID();
  return [prefix(scope) + id, { ...identity, id, at: new Date().toISOString(), action, details }];
}
export async function queueAudit(action: AuditAction, details: Record<string, unknown> = {}) {
  const entry = auditEntry(action, details);
  if (entry) { await idbSet(...entry); window.dispatchEvent(new Event("tilla-queue")); }
}
export function redactError(message: string) {
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/(?:https?:\/\/)[^\s]+/g, "[address]").replace(/(?:eyJ|sb_secret_)[\w.-]+/g, "[redacted]").slice(0, 1000);
}
let lastError = "", lastErrorAt = 0;
/** Fire-and-forget telemetry, with local durability and no recursive logging. */
export function logSystemError(category: "hardware" | "sync" | "runtime", error: unknown) {
  const scope = currentScope();
  const identity = scope ? readRegister(scope.storeId) : null;
  if (!scope || !identity) return;
  const message = redactError(error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error));
  const fingerprint = `${scope.storeId}:${category}:${message}`;
  if (fingerprint === lastError && Date.now() - lastErrorAt < 60_000) return;
  lastError = fingerprint; lastErrorAt = Date.now();
  const id = crypto.randomUUID();
  void idbSet(prefix(scope) + id, { ...identity, id, at: new Date().toISOString(), category, message }).then(() => window.dispatchEvent(new Event("tilla-queue"))).catch(() => {});
}
export const registerEventCount = async (scope: StoreScope) => (await idbEntries<EventRecord>(prefix(scope))).length;
let busy = false;
export async function syncRegisterEvents(scope: StoreScope) {
  if (busy || !navigator.onLine) return;
  busy = true;
  try {
    for (const [key, event] of await idbEntries<EventRecord>(prefix(scope))) {
      const now = currentScope();
      if (now?.storeId !== scope.storeId || now.userId !== scope.userId) break;
      const shared = { p_id: event.id, p_register_id: event.registerId, p_device_id: event.deviceId, p_occurred_at: event.at };
      const result = await networkRead(() => event.action
        ? supabase.rpc("record_register_event", { ...shared, p_action: event.action, p_details: JSON.parse(JSON.stringify(event.details ?? {})) })
        : supabase.rpc("record_system_error", { ...shared, p_category: event.category ?? "runtime", p_message: event.message ?? "Unknown error" }));
      if (result.error) continue;
      await idbDelete(key); // Never delete until the server confirms.
      window.dispatchEvent(new Event("tilla-queue"));
    }
  } catch { /* Retain every unconfirmed record for retry. */ }
  finally { busy = false; }
}