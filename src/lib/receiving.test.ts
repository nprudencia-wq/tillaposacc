import { describe, expect, it } from "vitest";
import { blankReceivingLine, updateReceivingLine, receivingTotal, invoiceUSD, stockCorrection, suggestedReceivingCost, repriceReceivingLines } from "./receiving";

describe("Phase 2 receiving and corrections", () => {
  it("defaults to the stored previous product cost in invoice currency", () => {
    expect(suggestedReceivingCost("p", [], 2.5, 20)).toBe("50");
  });
  it("reuses the most recent entered cost including an edited zero cost", () => {
    expect(suggestedReceivingCost("p", [{ product_id: "p", quantity: "1", unit_cost: "3.75" }], 2, 1)).toBe("3.75");
    expect(suggestedReceivingCost("p", [{ product_id: "p", quantity: "1", unit_cost: "0" }], 2, 1)).toBe("0");
  });
  it("converts edited costs instead of carrying USD numbers into Rand invoices", () => {
    expect(repriceReceivingLines([{ product_id: "p", quantity: "2", unit_cost: "3" }], 1, 20, () => 2)[0]?.unit_cost).toBe("60");
  });
  it("adds a blank row only after the last entry is complete", () => {
    const partial = updateReceivingLine([blankReceivingLine()], 0, { product_id: "product", quantity: "2" });
    expect(partial).toHaveLength(1);
    const complete = updateReceivingLine(partial, 0, { unit_cost: "3" });
    expect(complete).toHaveLength(2);
    expect(complete[1]).toEqual(blankReceivingLine());
    expect(updateReceivingLine(complete, 0, { quantity: "4" })).toHaveLength(2);
  });
  it("accepts zero cost but requires positive quantity", () => {
    expect(updateReceivingLine([blankReceivingLine()], 0, { product_id: "p", quantity: "1", unit_cost: "0" })).toHaveLength(2);
    expect(updateReceivingLine([blankReceivingLine()], 0, { product_id: "p", quantity: "0", unit_cost: "1" })).toHaveLength(1);
  });
  it("converts USD, ZiG and Rand supplier amounts to USD", () => {
    expect(invoiceUSD(10, "USD", 1)).toBe(10);
    expect(invoiceUSD(280, "ZiG", 28)).toBe(10);
    expect(invoiceUSD(185, "ZAR", 18.5)).toBe(10);
    expect(() => invoiceUSD(10, "ZAR", 0)).toThrow();
  });
  it("excludes the automatically added empty row from totals", () => {
    expect(receivingTotal([{ product_id: "p", quantity: "2", unit_cost: "3.50" }, blankReceivingLine()])).toBe(7);
  });
  it("allows audited corrections including zero and rejects missing reasons", () => {
    expect(stockCorrection(8, 0, "Count error")).toBe(-8);
    expect(stockCorrection(8, 12, "Opening balance error")).toBe(4);
    expect(stockCorrection(8, 8, "")).toBe(0);
    expect(() => stockCorrection(8, 2, "")).toThrow();
    expect(() => stockCorrection(8, -1, "Error")).toThrow();
  });
});