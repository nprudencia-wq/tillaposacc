import { describe, it, expect } from "vitest";
import { matchDeposits } from "./deposits";
const m = (id: string, type: string, reason: string, amount: number, at: string) => ({ id, type, reason, amount, currency: "USD", created_at: at });
describe("matchDeposits", () => {
  it("marks a deposit claimed when a matching refund follows", () => {
    const r = matchDeposits([m("a", "paid_in", "Bottle deposit taken — John", 1, "2026-11-01T08:00:00Z"), m("b", "paid_out", "Bottle deposit returned — John", 1, "2026-11-03T08:00:00Z")]);
    expect(r[0]!.claimed).toBe("2026-11-03T08:00:00Z");
    expect(r[0]!.days).toBe(2);
  });
  it("leaves a deposit unclaimed when the refund amount differs", () => {
    const r = matchDeposits([m("a", "paid_in", "Bottle deposit taken", 1, "2026-11-01T08:00:00Z"), m("b", "paid_out", "Bottle deposit returned", 2, "2026-11-02T08:00:00Z")], new Date("2026-11-11T08:00:00Z"));
    expect(r[0]!.claimed).toBeNull();
    expect(r[0]!.days).toBe(10);
  });
});
