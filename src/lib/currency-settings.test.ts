import { describe, expect, it } from "vitest";
import { randCheckoutEnabled, reciprocalRate } from "./currency-settings";

describe("Rand confirmation", () => {
  it("keeps R20/USD disabled until explicitly confirmed", () => {
    expect(randCheckoutEnabled(20, null)).toBe(false);
    expect(randCheckoutEnabled(20, 20)).toBe(true);
  });
  it("requires a fresh confirmation after the rate changes", () => {
    expect(randCheckoutEnabled(21, 20)).toBe(false);
  });
  it("shows both directions without silently inverting the rate", () => {
    expect(reciprocalRate(20)).toBe(0.05);
    expect(reciprocalRate(0.05)).toBe(20);
  });
  it("rejects invalid rates even if confirmation matches", () => {
    expect(randCheckoutEnabled(0, 0)).toBe(false);
    expect(reciprocalRate(-1)).toBeNull();
  });
});