import { describe, expect, it } from "vitest";
import { assetRegisterRows } from "./asset-register";
import { type GlAccount, type TbRow } from "./ledger";

const accounts: GlAccount[] = [
  { code: "990", name: "Building", type: "asset", active: true, system: false },
  { code: "991", name: "Furniture", type: "asset", active: false, system: false },
  { code: "990-AD", name: "Accumulated depreciation", type: "asset", active: true, system: true },
  { code: "1000", name: "Cash", type: "asset", active: true, system: true },
];
const tb: TbRow[] = [
  { code: "990", name: "Building", type: "asset", balance: 10000, debit: 10000, credit: 0 },
  { code: "990-AD", name: "Accumulated depreciation", type: "asset", balance: -1000, debit: 0, credit: 1000 },
];
describe("asset register", () => {
  it("matches the ledger cost, accumulated depreciation and current book value", () => {
    const [asset] = assetRegisterRows(accounts, tb, [], []);
    expect(asset?.cost).toBe(10000);
    expect(asset?.accumulated).toBe(1000);
    expect(asset?.bookValue).toBe(9000);
  });
  it("keeps purchase and first-use dates separate and shares the depreciation rate", () => {
    const [asset] = assetRegisterRows(accounts, tb, [{ account_code: "990", purchase_date: "2025-01-01" }], [{ account_code: "990", start_date: "2025-07-01", rate: 10 }]);
    expect(asset?.purchaseDate).toBe("2025-01-01");
    expect(asset?.startDate).toBe("2025-07-01");
    expect(asset?.rate).toBe(10);
  });
  it("retains inactive and zero-balance assets but excludes cash and contra accounts", () => {
    const rows = assetRegisterRows(accounts, tb, [], []);
    expect(rows.map((r) => r.code)).toEqual(["990", "991"]);
    expect(rows[1]?.bookValue).toBe(0);
    expect(rows[1]?.active).toBe(false);
  });
});