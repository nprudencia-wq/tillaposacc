import { describe, expect, it } from "vitest";
import { annualDepreciation } from "./depreciation";

describe("annual asset depreciation from first use", () => {
  it("posts nothing before the asset was first used", () => {
    expect(annualDepreciation(10000, 0, 10, "2026-07-01", 2025, "2026-12-31")).toBe(0);
  });
  it("prorates the first year from the first-used date, not the journal date", () => {
    expect(annualDepreciation(10000, 0, 10, "2025-07-01", 2025, "2025-12-31")).toBe(504.11);
  });
  it("uses all days in a leap year", () => {
    expect(annualDepreciation(10000, 0, 10, "2024-07-01", 2024, "2024-12-31")).toBe(502.73);
  });
  it("charges a full annual rate in subsequent completed years", () => {
    expect(annualDepreciation(10000, 504.11, 10, "2025-07-01", 2026, "2026-12-31")).toBe(1000);
  });
  it("requires an explicit first-used date", () => {
    expect(annualDepreciation(10000, 0, 10, "", 2026, "2026-12-31")).toBe(0);
  });
  it("does not charge future days in the current year", () => {
    expect(annualDepreciation(10000, 0, 10, "2026-11-01", 2026, "2026-11-11")).toBe(30.14);
  });
  it("never reduces net book value below zero", () => {
    expect(annualDepreciation(10000, 9990, 10, "2025-07-01", 2026, "2026-12-31")).toBe(10);
  });
});