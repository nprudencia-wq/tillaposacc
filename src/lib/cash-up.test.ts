import { describe, expect, it } from "vitest";
import { buildCashUp, parseCashCounts, type CashUpSource } from "./cash-up";

const summary: CashUpSource = {
  shift: { opening_float_usd: 50, opening_float_zig: 0, opening_float_zar: 100 },
  cash_in_usd: 120, cash_in_zig: 0, cash_in_zar: 200,
  change_usd: 20, change_zig: 0, change_zar: 20,
  refunds_usd: 5, refunds_zig: 0, refunds_zar: 10,
  paid_in_usd: 15, paid_in_zig: 0, paid_in_zar: 30,
  paid_out_usd: 30, paid_out_zig: 0, paid_out_zar: 40,
  expected_usd: 130, expected_zig: 0, expected_zar: 260,
};

describe("till cash-up", () => {
  it("tallies cash in and out and leaves opening float out of settlement takings", () => {
    const usd = buildCashUp(summary, { USD: 127 })[0];
    expect(usd).toMatchObject({ cashIn: 185, cashOut: 55, expected: 130, settlementCash: 80, variance: -3 });
  });

  it("keeps Rand cash separate and combines safe drops with payouts", () => {
    const zar = buildCashUp(summary, { ZAR: 260 })[2];
    expect(zar).toMatchObject({ cashIn: 330, cashOut: 70, expected: 260, settlementCash: 160, variance: 0 });
  });

  it("accepts zero counts but rejects blank or negative drawer counts", () => {
    expect(parseCashCounts({ usd: "0", zig: "0.00", zar: "25.50" })).toEqual({ usd: 0, zig: 0, zar: 25.5 });
    expect(parseCashCounts({ usd: "", zig: "0", zar: "0" })).toBeNull();
    expect(parseCashCounts({ usd: "-1", zig: "0", zar: "0" })).toBeNull();
  });
});
