import { describe, it, expect } from "vitest";
import { buildSettlement, groupTotals } from "./settlement";

const types = [
  { code: "cash", name: "Cash", is_cash: true },
  { code: "ecocash", name: "EcoCash", is_cash: false },
  { code: "account", name: "On account", is_cash: false, is_account: true },
];

describe("daily settlement", () => {
  const rows = buildSettlement({
    types,
    sales: [
      { id: "1", sale_number: "TXN-1", created_at: "2026-11-09T08:00:00Z", cashier: "A", change_given: 2, payments: [{ method: "cash", amount: 10, exchange_rate: 1 }] },
      { id: "2", sale_number: "TXN-2", created_at: "2026-11-09T09:00:00Z", cashier: "A", change_given: 0, payments: [{ method: "ecocash", amount: 5, exchange_rate: 1 }, { method: "cash", amount: 200, exchange_rate: 20 }] },
      { id: "3", sale_number: "TXN-3", created_at: "2026-11-09T10:00:00Z", cashier: "B", change_given: 0, payments: [{ method: "account", amount: 7, exchange_rate: 1 }] },
    ],
    refunds: [{ id: "r1234567890", created_at: "2026-11-09T11:00:00Z", cashier: "A", method: "cash", amount: 1 }],
    repayments: [{ payment_number: "PAY-1", created_at: "2026-11-09T12:00:00Z", cashier: "B", method: "cash", amount: 4 }],
    movements: [{ id: "m", created_at: "2026-11-09T13:00:00Z", cashier: "A", type: "cash_drop", usd: 5 }, { id: "d", created_at: "2026-11-09T12:00:00Z", cashier: "B", type: "paid_in", usd: 4, reason: "Debt payment from Jo" }],
  });

  it("cash expected = sales less change + repayments − refunds − drops, Rand converted to USD", () => {
    const cash = rows.find((r) => r.method === "cash")!;
    expect(cash.sales).toBe(18); // 10 − 2 change + R200 at 20 = $10
    expect(cash.expected).toBe(16); // 18 + 4 − 1 − 5
    expect(cash.sources).toHaveLength(5);
  });

  it("splits totals into cash, other and account", () => {
    expect(groupTotals(rows)).toEqual({ cash: 16, other: 5, account: 7 });
  });
});
