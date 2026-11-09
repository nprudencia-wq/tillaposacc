import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet } from "@/lib/local-db";
import { cached, currentScope, deviceSales, isNetworkError, type QueuedSale } from "@/lib/offline";
import { networkRead, setInternetAvailable } from "@/lib/connectivity";
import { scopedStorageKey, type StoreScope } from "@/lib/store-scope";
import { isAccountMethod } from "@/lib/payment-types";
import type { Currency } from "@/lib/pos";

/** Customer balances downloaded from the server, plus which device references they already include. */
export type CreditSnapshot = { at: string; balances: Record<string, number>; sale_refs: string[]; pay_refs: string[] };

/** A customer debt payment taken on this till; kept after upload so balances stay right until the next download. */
export type QueuedRepayment = {
  client_ref: string; customer_id: string; customer_name: string; amount: number; currency: Currency; usd: number;
  method: string; reference: string; paid_at: string; shift_id: string | null; uploaded?: boolean; error?: string;
};

const REPAY_KEY = "tilla-offline-repayments";

export function creditSnapshot() {
  return cached<CreditSnapshot>("customer-credit", async () => {
    const { data, error } = await supabase.rpc("customer_credit_snapshot" as never);
    if (error) throw error;
    return data as unknown as CreditSnapshot;
  });
}

/** What the customer owes right now, in US$: the downloaded balance plus this till's sales and payments it doesn't include yet. */
export function owedNow(customerId: string, snap: CreditSnapshot | undefined, sales: QueuedSale[], repayments: QueuedRepayment[], isAccount: (m: string) => boolean) {
  const saleRefs = new Set(snap?.sale_refs ?? []);
  const payRefs = new Set(snap?.pay_refs ?? []);
  let owed = Number(snap?.balances?.[customerId] ?? 0);
  for (const s of sales) {
    if (s.customer_id !== customerId || saleRefs.has(s.client_ref)) continue;
    for (const p of s.payments) if (isAccount(p.method)) owed += Number(p.amount) / (Number(p.exchange_rate) || 1);
  }
  for (const r of repayments) if (r.customer_id === customerId && !payRefs.has(r.client_ref)) owed -= r.usd;
  return Math.round(owed * 100) / 100;
}

/** Error text when putting `charge` US$ on account would pass the limit; 0 limit means no limit (same as the server). */
export function creditLimitError(name: string, limit: number, owed: number, charge: number) {
  if (!(limit > 0)) return null;
  if (owed + charge > limit + 0.005) {
    const left = Math.max(0, Math.round((limit - owed) * 100) / 100);
    return `${name} has reached their credit limit of $${limit.toFixed(2)} (owes $${owed.toFixed(2)}, $${left.toFixed(2)} left).`;
  }
  return null;
}

export async function readRepayments(scope: StoreScope | null = currentScope()): Promise<QueuedRepayment[]> {
  if (!scope) return [];
  return (await idbGet<QueuedRepayment[]>(scopedStorageKey(REPAY_KEY, scope)).catch(() => undefined)) ?? [];
}
async function writeRepayments(scope: StoreScope, list: QueuedRepayment[]) {
  // Keep every pending one; keep the newest 300 uploaded ones for balance maths.
  const pending = list.filter((r) => !r.uploaded);
  const done = list.filter((r) => r.uploaded).slice(-300);
  await idbSet(scopedStorageKey(REPAY_KEY, scope), [...done, ...pending]);
  window.dispatchEvent(new Event("tilla-queue"));
}

export async function enqueueRepayment(r: QueuedRepayment) {
  const scope = currentScope();
  if (!scope) throw new Error("Wait for your store account to load");
  if (!(r.amount > 0) || !Number.isFinite(r.amount)) throw new Error("Enter an amount above zero");
  const list = await readRepayments(scope);
  if (list.some((x) => x.client_ref === r.client_ref)) return;
  await writeRepayments(scope, [...list, r]);
}

export async function pendingRepayments() {
  return (await readRepayments()).filter((r) => !r.uploaded);
}

/** Customer's owed amount using this cashier's device records. */
export async function customerOwed(customerId: string) {
  const [snap, sales, reps] = await Promise.all([creditSnapshot().catch(() => undefined), deviceSales(), readRepayments()]);
  return owedNow(customerId, snap, sales, reps, isAccountMethod);
}

/** Upload pending debt payments (optionally only one shift's). Returns false if the internet dropped. */
export async function syncRepayments(scope: StoreScope, timeout: number, shiftId?: string): Promise<boolean> {
  const list = await readRepayments(scope);
  let changed = false, ok = true;
  for (const r of list) {
    if (r.uploaded || (shiftId && r.shift_id !== shiftId)) continue;
    const { error } = await networkRead(() => supabase.rpc("receive_offline_customer_payment" as never, {
      p_client_ref: r.client_ref, p_customer: r.customer_id, p_amount: r.amount, p_currency: r.currency, p_method: r.method,
      p_reference: r.reference, p_paid_at: r.paid_at, p_shift: r.shift_id,
    } as never), timeout);
    if (error && isNetworkError(error)) { setInternetAvailable(false); ok = false; break; }
    if (error) window.__lovableEvents?.track?.("project.offline_upload_failed", { kind: "repayment", network: false });
    Object.assign(r, error ? { error: error.message } : { uploaded: true, error: undefined });
    changed = true;
  }
  if (changed) await writeRepayments(scope, list);
  return ok;
}
