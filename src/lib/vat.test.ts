import { describe, it, expect } from "vitest";
import { vatBreakdown } from "./vat";

describe("vatBreakdown", () => {
  it("splits a 15% VAT-inclusive $11.50 into $10 net + $1.50 VAT", () => {
    expect(vatBreakdown(11.5, 15)).toEqual({ net: 10, vat: 1.5 });
  });
  it("has no VAT at 0%", () => {
    expect(vatBreakdown(20, 0)).toEqual({ net: 20, vat: 0 });
  });
});
