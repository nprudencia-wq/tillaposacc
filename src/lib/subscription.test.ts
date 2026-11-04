import { describe, it, expect } from "vitest";
import { subState } from "./subscription";

describe("subscription state", () => {
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
