import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/offline", () => ({ currentScope: () => null, isNetworkError: () => false }));
import { mergeCashMovements, movementsMissingFrom, type QueuedCashMovement } from "./offline-cash";

const mv = (o: Partial<QueuedCashMovement>): QueuedCashMovement => ({ client_ref: "MOV-1", shift_id: "s1", type: "cash_drop", currency: "USD", amount: 10, reason: "safe", at: "2026-11-09T10:00:00Z", ...o });

describe("offline cash movements in shift reports", () => {
  it("a pending safe drop lowers expected drawer cash", () => {
    const r = mergeCashMovements({ movements: [], expected_usd: 50, paid_out_usd: 0 }, [mv({})]) as Record<string, unknown>;
    expect(r.expected_usd).toBe(40); expect(r.paid_out_usd).toBe(10);
  });
  it("a pending paid-in raises expected Rand cash", () => {
    const r = mergeCashMovements({ movements: [], expected_zar: 100 }, [mv({ type: "paid_in", currency: "ZAR", amount: 20 })]) as Record<string, unknown>;
    expect(r.expected_zar).toBe(120);
  });
  it("an uploaded movement already in the downloaded report is not counted twice", () => {
    const list = [mv({ uploaded: true, uploaded_at: "2026-11-09T10:01:00Z" }), mv({ client_ref: "MOV-2" })];
    expect(movementsMissingFrom(list, "s1", "2026-11-09T10:05:00Z").map((m) => m.client_ref)).toEqual(["MOV-2"]);
  });
});
