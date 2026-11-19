import type { Currency } from "@/lib/pos";

export type CashCountInputs = { usd: string; zig: string; zar: string };
export type CashCounts = { usd: number; zig: number; zar: number };

/** The shift fields used by both the till cash-up and the X/Z reports. */
export type CashUpSource = {
  shift: { opening_float_usd: number; opening_float_zig: number; opening_float_zar: number };
  cash_in_usd: number; cash_in_zig: number; cash_in_zar?: number;
  change_usd: number; change_zig: number; change_zar?: number;
  refunds_usd: number; refunds_zig: number; refunds_zar?: number;
  paid_in_usd: number; paid_in_zig: number; paid_in_zar?: number;
  paid_out_usd: number; paid_out_zig: number; paid_out_zar?: number;
  expected_usd: number; expected_zig: number; expected_zar?: number;
};

export type CashUpRow = {
  currency: Currency;
  openingFloat: number;
  cashSales: number;
  paidIn: number;
  cashIn: number;
  change: number;
  refunds: number;
  paidOut: number;
  cashOut: number;
  expected: number;
  settlementCash: number;
  variance: number | null;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const number = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Present one shift's drawer totals per currency. The opening float is part of
 * expected drawer cash, but not takings passed into Back Office Daily settlement.
 */
export function buildCashUp(summary: CashUpSource, counted: Partial<Record<Currency, number | null>> = {}): CashUpRow[] {
  const fields = summary as unknown as Record<string, unknown>;
  return (["USD", "ZiG", "ZAR"] as const).map((currency) => {
    const suffix = currency === "USD" ? "usd" : currency === "ZiG" ? "zig" : "zar";
    const field = (name: string) => number(fields[`${name}_${suffix}`]);
    const openingFloat = number(summary.shift[`opening_float_${suffix}`]);
    const cashSales = field("cash_in");
    const paidIn = field("paid_in");
    const change = field("change");
    const refunds = field("refunds");
    const paidOut = field("paid_out");
    const expected = field("expected");
    const count = counted[currency];
    return {
      currency,
      openingFloat,
      cashSales,
      paidIn,
      cashIn: r2(openingFloat + cashSales + paidIn),
      change,
      refunds,
      paidOut,
      cashOut: r2(change + refunds + paidOut),
      expected,
      settlementCash: r2(expected - openingFloat),
      variance: count == null || !Number.isFinite(count) ? null : r2(count - expected),
    };
  });
}

/** Closing requires a non-negative count in every supported currency, including zero. */
export function parseCashCounts(counts: CashCountInputs): CashCounts | null {
  const values = [counts.usd, counts.zig, counts.zar];
  if (values.some((value) => value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0)) return null;
  return { usd: Number(counts.usd), zig: Number(counts.zig), zar: Number(counts.zar) };
}
