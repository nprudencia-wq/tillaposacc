import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, trialDaysLeft, validateSignup } from "./signup";

const ok = { shopName: "Mai Tendai Store", ownerName: "Tendai", phone: "0771234567", email: "t@shop.co.zw", password: "longpass1" };

describe("store sign-up", () => {
  it("trial lasts 14 days", () => expect(TRIAL_DAYS).toBe(14));
  it("counts days left and stops at zero", () => {
    const start = new Date("2026-11-09T12:00:00Z");
    expect(trialDaysLeft("2026-11-23T12:00:00Z", start)).toBe(14);
    expect(trialDaysLeft("2026-11-08T12:00:00Z", start)).toBe(0);
  });
  it("rejects short passwords", () => expect(() => validateSignup({ ...ok, password: "short" })).toThrow());
  it("rejects bad email", () => expect(() => validateSignup({ ...ok, email: "nope" })).toThrow());
  it("accepts a valid shop", () => expect(validateSignup(ok)).toBe(ok));
});
