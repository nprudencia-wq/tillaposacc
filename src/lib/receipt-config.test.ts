import { describe, expect, it } from "vitest";
import { receiptConfig } from "./receipt-config";

describe("receiptConfig", () => {
  it("defaults to 58mm paper", () => expect(receiptConfig(null).paper_width).toBe("58mm"));
  it("keeps 80mm when chosen", () => expect(receiptConfig({ paper_width: "80mm" }).paper_width).toBe("80mm"));
  it("rejects unknown widths", () => expect(receiptConfig({ paper_width: "110mm" }).paper_width).toBe("58mm"));
});
