import { describe, it, expect } from "vitest";
import { subState, storeSubscriptionState, tillSubscriptionCharge } from "./subscription";

describe("subscription state", () => {
  it("never charges the vendor store even with many tills", () => {
    expect(tillSubscriptionCharge(10, 100, 12, true)).toBe(0);
  });
  it("charges client shops $10 per till per month", () => {
    expect(tillSubscriptionCharge(10, 3, 2, false)).toBe(60);
  });
  it("never locks the exempt vendor store after expiry", () => {
    expect(storeSubscriptionState("2020-01-01", 0, "2026-11-06", true)).toBe("active");
  });
  it("locks a 14-day trial on day 15 without extra grace", () => {
    expect(storeSubscriptionState("2026-11-19", 0, "2026-11-20", false)).toBe("locked");
    expect(storeSubscriptionState("2026-11-19", 0, "2026-11-19", false)).toBe("active");
  });
  it("is active up to and including the paid-until date", () => {
    expect(subState("2026-11-30", 5, "2026-11-30")).toBe("active");
  });
  it("gives a 5-day grace period after expiry", () => {
    expect(subState("2026-11-30", 5, "2026-12-05")).toBe("grace");
  });
  it("locks the till after the grace period", () => {
    expect(subState("2026-11-30", 5, "2026-12-06")).toBe("locked");
  });
});
