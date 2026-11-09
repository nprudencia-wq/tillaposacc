import { describe, expect, it } from "vitest";
import { nextFromPool, offlineRef, receiptNumber } from "./receipt-numbers";
describe("offline receipt numbers", () => {
  it("uses the lowest reserved number first so receipts run in order", () => {
    expect(nextFromPool([1052, 1050, 1051])).toEqual({ next: 1050, rest: [1051, 1052] });
  });
  it("has no number when the pool is empty", () => { expect(nextFromPool([]).next).toBeNull(); });
  it("prints the same TXN format as online sales and encodes the number for upload", () => {
    expect(receiptNumber(1050)).toBe("TXN-1050");
    expect(offlineRef(1050)).toMatch(/^RSV-1050-/);
  });
});
