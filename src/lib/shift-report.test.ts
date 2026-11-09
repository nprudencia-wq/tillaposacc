import { describe, expect, it } from "vitest";
import { mergeShiftReport, type ShiftSnapshot } from "./shift-report";
import type { QueuedSale } from "./offline";
const snapshot: ShiftSnapshot = { refs: ["uploaded"], lines: [], checkedAt: "2026-11-09T07:00:00Z", summary: {
  shift: { id: "shift", shift_number: "SH-1", status: "open", cashier_id: "cashier", opened_at: "2026-11-09T06:00:00Z", closed_at: null,
    opening_float_usd: 10, opening_float_zig: 0, opening_float_zar: 20, actual_cash_usd: null, actual_cash_zig: null, actual_cash_zar: null, variance_usd: null, variance_zig: null, variance_zar: null, notes: null },
  sales_count: 1, sales_total_usd: 2, payments: [], movements: [], cash_in_usd: 2, cash_in_zig: 0, change_usd: 0, change_zig: 0, refunds_usd: 0, refunds_zig: 0,
  paid_in_usd: 0, paid_in_zig: 0, paid_out_usd: 0, paid_out_zig: 0, expected_usd: 12, expected_zig: 0,
} };
const sale: QueuedSale = { client_ref: "local", shift_id: "shift", total: 3, sold_at: "2026-11-09T07:00:00Z", currency: "USD", discount: 0, items: [{ product_id: "bread", quantity: 3, unit_price: 1 }], payments: [{ method: "drawer", currency: "USD", amount: 5 }] };
describe("offline shift reports", () => {
  it("keeps uploaded sales once and ignores other shifts", () => {
    const { summary } = mergeShiftReport(snapshot, [sale, sale, { ...sale, client_ref: "uploaded" }, { ...sale, client_ref: "other", shift_id: "other" }], (m) => m === "drawer");
    expect(summary.sales_count).toBe(2); expect(summary.sales_total_usd).toBe(5);
    expect(snapshot.summary.sales_count).toBe(1);
  });
  it("adds drawer tender less change and item quantities offline", () => {
    const result = mergeShiftReport(snapshot, [sale], (m) => m === "drawer");
    expect(result.summary.cash_in_usd).toBe(7); expect(result.summary.change_usd).toBe(2); expect(result.summary.expected_usd).toBe(15);
    expect(result.items[0]).toMatchObject({ sold: 3, net: 3, total: 3 });
  });
  it("does not add non-cash tender to the drawer", () => {
    const result = mergeShiftReport(snapshot, [{ ...sale, payments: [{ method: "card", currency: "USD", amount: 3 }] }], () => false);
    expect(result.summary.expected_usd).toBe(12); expect(result.summary.payments[0]?.amount).toBe(3);
  });
  it("uses historical Rand exchange rate and gives change in sale currency", () => {
    const result = mergeShiftReport(snapshot, [{ ...sale, currency: "ZAR", rand_rate: 20, payments: [{ method: "drawer", currency: "ZAR", amount: 80, exchange_rate: 20 }] }], () => true);
    const fields = result.summary as unknown as Record<string, number>;
    expect(fields["cash_in_zar"]).toBe(80); expect(fields["change_zar"]).toBe(20); expect(fields["expected_zar"]).toBe(60);
  });
});