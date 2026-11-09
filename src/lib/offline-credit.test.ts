import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { owedNow, creditLimitError, type CreditSnapshot } from "./offline-credit";
import type { QueuedSale } from "./offline";

const isAcc = (m: string) => m === "account";
const snap: CreditSnapshot = { at: "", balances: { c1: 40 }, sale_refs: ["OLD"], pay_refs: ["P-OLD"] };
const sale = (ref: string, amt: number): QueuedSale => ({ client_ref: ref, sold_at: "", shift_id: "s", currency: "USD", discount: 0, items: [], payments: [{ method: "account", currency: "USD", amount: amt, exchange_rate: 1 }], total: amt, customer_id: "c1" });
const rep = (ref: string, usd: number) => ({ client_ref: ref, customer_id: "c1", customer_name: "Jo", amount: usd, currency: "USD" as const, usd, method: "cash", reference: "", paid_at: "", shift_id: null });

describe("offline credit limit", () => {
  it("adds this till's account sales and subtracts its payments, skipping ones already in the download", () => {
    expect(owedNow("c1", snap, [sale("OLD", 10), sale("NEW", 15)], [rep("P-OLD", 5), rep("P-NEW", 5)], isAcc)).toBe(50);
  });
  it("blocks a sale that would pass the limit and allows one that reaches it exactly", () => {
    expect(creditLimitError("Jo", 60, 50, 10.01)).toMatch(/credit limit/);
    expect(creditLimitError("Jo", 60, 50, 10)).toBeNull();
  });
  it("a zero limit means no limit, like the server", () => {
    expect(creditLimitError("Jo", 0, 500, 100)).toBeNull();
  });
});
