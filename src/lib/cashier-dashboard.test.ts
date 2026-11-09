import { describe, expect, it } from "vitest";
import { harareDay, cashierDailyTotals } from "./cashier-dashboard";
import type { QueuedSale } from "./offline";
const queued = (ref: string, overrides = {}): QueuedSale => ({ client_ref: ref, store_id: "shop", user_id: "me", sold_at: "2026-11-09T08:00:00Z", shift_id: "shift", currency: "USD", discount: 0, items: [], payments: [], total: 3, ...overrides });
describe("Cashier daily dashboard", () => {
  it("uses Harare midnight regardless of the device timezone", () => {
    expect(harareDay(new Date("2026-11-08T22:30:00Z"))).toEqual({ day: "2026-11-09", start: "2026-11-08T22:00:00.000Z", end: "2026-11-09T22:00:00.000Z" });
  });
  it("counts queued sales once even during an upload readback", () => {
    const { start, end } = harareDay(new Date("2026-11-09T08:00:00Z"));
    expect(cashierDailyTotals([{ total: 3, client_ref: "uploaded" }], [queued("uploaded"), queued("pending")], "shop", "me", start, end)).toEqual({ count: 2, total: 6, localCount: 1 });
  });
  it("excludes other cashiers, stores and days from daily sales", () => {
    const { start, end } = harareDay(new Date("2026-11-09T08:00:00Z"));
    expect(cashierDailyTotals([], [queued("other", { user_id: "them" }), queued("store", { store_id: "other" }), queued("yesterday", { sold_at: "2026-11-08T12:00:00Z" }), queued("tomorrow", { sold_at: end })], "shop", "me", start, end).count).toBe(0);
  });
});