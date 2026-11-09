import { describe, expect, it } from "vitest";
import { groupByTill } from "./multi-till";

describe("groupByTill", () => {
  it("keeps one till's totals together across cashier handovers", () => {
    const shifts = [
      { id: "a", device_name: "Counter 1", cashier: "Charmaine", status: "closed", opened_at: "2026-11-09T06:00:00Z", closed_at: "2026-11-09T10:00:00Z", variance_usd: -1 },
      { id: "b", device_name: "Counter 1", cashier: "Tendai", status: "open", opened_at: "2026-11-09T10:05:00Z", closed_at: null, variance_usd: null },
      { id: "c", device_name: "Counter 2", cashier: "Rudo", status: "open", opened_at: "2026-11-09T07:00:00Z", closed_at: null, variance_usd: null },
    ];
    const sales = [
      { shift_id: "a", total: 4, status: "completed", payments: [{ method: "cash", amount: 4 }] },
      { shift_id: "b", total: 6, status: "completed", payments: [{ method: "ecocash", amount: 6 }] },
      { shift_id: "c", total: 3, status: "completed", payments: [{ method: "cash", amount: 3 }] },
      { shift_id: "c", total: 9, status: "refunded", payments: [{ method: "cash", amount: 9 }] },
    ];
    const [c1, c2] = groupByTill(shifts, sales);
    expect(c1).toMatchObject({ till: "Counter 1", sales: 10, count: 2, average: 5, open: true, variance: -1, cashiers: ["Charmaine", "Tendai"] });
    expect(c2).toMatchObject({ till: "Counter 2", sales: 3, count: 1 });
  });
});
