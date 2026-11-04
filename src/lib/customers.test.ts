import { describe, expect, it } from "vitest";
import { ageDebt, overLimit } from "./customers";

const asOf = new Date("2026-11-04T12:00:00Z");

describe("customer debt", () => {
  it("payments clear the oldest debt first", () => {
    const a = ageDebt([{ date: "2026-07-01T10:00:00Z", amount: 50 }, { date: "2026-10-20T10:00:00Z", amount: 30 }], 50, asOf);
    expect(a.over90).toBe(0);
    expect(a.d30).toBe(30);
    expect(a.total).toBe(30);
  });
  it("puts debt into 31-60, 61-90 and 90+ buckets", () => {
    const a = ageDebt([
      { date: "2026-09-20T10:00:00Z", amount: 10 },
      { date: "2026-08-20T10:00:00Z", amount: 20 },
      { date: "2026-06-01T10:00:00Z", amount: 40 },
    ], 0, asOf);
    expect([a.d60, a.d90, a.over90, a.total]).toEqual([10, 20, 40, 70]);
  });
  it("a credit limit of 0 means no limit", () => {
    expect(overLimit(500, 100, 0)).toBe(false);
    expect(overLimit(80, 30, 100)).toBe(true);
    expect(overLimit(70, 30, 100)).toBe(false);
  });
});
