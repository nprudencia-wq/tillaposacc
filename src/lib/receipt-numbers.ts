import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet } from "@/lib/local-db";
import { scopedStorageKey } from "@/lib/store-scope";
import { currentScope } from "@/lib/offline";

// Receipt numbers reserved from the shop's TXN sequence while online, used one by one offline,
// so offline receipts carry the same TXN-#### the shop records keep after upload.
const POOL_KEY = "tilla-receipt-numbers";
const LOW = 20;
const BATCH = 50;
let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(run: () => Promise<T>) => { const r = chain.then(run, run); chain = r.catch(() => {}); return r; };

export const offlineRef = (n: number) => `RSV-${n}-${crypto.randomUUID()}`;
export const receiptNumber = (n: number) => `TXN-${n}`;

/** Smallest unused number first so receipts on this till stay in order. */
export function nextFromPool(pool: number[]): { next: number | null; rest: number[] } {
  const sorted = [...new Set(pool)].sort((a, b) => a - b);
  return { next: sorted[0] ?? null, rest: sorted.slice(1) };
}

export function takeReservedNumber(): Promise<number | null> {
  return serial(async () => {
    const scope = currentScope();
    if (!scope) return null;
    const key = scopedStorageKey(POOL_KEY, scope);
    const { next, rest } = nextFromPool((await idbGet<number[]>(key)) ?? []);
    if (next !== null) await idbSet(key, rest);
    return next;
  });
}

/** Online only: keep a stock of numbers on the device for the next outage. */
export function topUpReservedNumbers(): Promise<void> {
  return serial(async () => {
    const scope = currentScope();
    if (!scope) return;
    const key = scopedStorageKey(POOL_KEY, scope);
    const pool = (await idbGet<number[]>(key)) ?? [];
    if (pool.length >= LOW) return;
    const { data, error } = await supabase.rpc("reserve_sale_numbers", { p_count: BATCH });
    if (error || !Array.isArray(data)) return;
    const s = currentScope();
    if (s?.storeId !== scope.storeId || s?.userId !== scope.userId) return;
    await idbSet(key, [...new Set([...pool, ...(data as number[]).map(Number)])].sort((a, b) => a - b));
  }).catch(() => {});
}
