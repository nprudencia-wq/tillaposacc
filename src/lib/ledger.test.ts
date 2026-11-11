import { describe, expect, it } from "vitest";
import { assetSchedule, balanceSheet, journalBalanced, profitFor, trialBalance, type GlAccount, type GlLine } from "./ledger";

const acc: GlAccount[] = [
  { code: "1000", name: "Cash", type: "asset", system: true, active: true },
  { code: "1200", name: "Stock", type: "asset", system: true, active: true },
  { code: "2000", name: "Creditors", type: "liability", system: true, active: true },
  { code: "4000", name: "Sales", type: "income", system: true, active: true },
  { code: "5000", name: "COGS", type: "expense", system: true, active: true },
];
const L = (d: string, a: string, dr: number, cr: number): GlLine => ({ entry_date: d, source: "x", reference: "r", memo: "", account_code: a, debit: dr, credit: cr });
const lines = [
  L("2026-10-01", "1200", 100, 0), L("2026-10-01", "2000", 0, 100), // GRN on credit
  L("2026-11-02", "1000", 30, 0), L("2026-11-02", "4000", 0, 30), // $30 sale
  L("2026-11-02", "5000", 18, 0), L("2026-11-02", "1200", 0, 18),
];

describe("ledger", () => {
  it("trial balance debits equal credits", () => {
    const tb = trialBalance(lines, acc);
    expect(tb.reduce((a, r) => a + r.debit, 0)).toBe(tb.reduce((a, r) => a + r.credit, 0));
    expect(tb.find((r) => r.code === "1200")?.balance).toBe(82);
  });
  it("balance sheet balances with current earnings", () => {
    const bs = balanceSheet(trialBalance(lines, acc));
    expect(bs.earnings).toBe(12);
    expect(bs.totalAssets).toBe(112);
    expect(bs.balanced).toBe(true);
  });
  it("profit only counts the chosen dates", () => {
    expect(profitFor(lines, acc, "2026-11-01", "2026-11-30").profit).toBe(12);
    expect(profitFor(lines, acc, "2026-10-01", "2026-10-31").profit).toBe(0);
  });
  it("asset schedule pairs cost with accumulated depreciation", () => {
    const accs: GlAccount[] = [
      ...acc,
      { code: "990", name: "Building", type: "asset", system: false, active: true },
      { code: "990-AD", name: "Accumulated depreciation - Building", type: "asset", system: false, active: true },
    ];
    const ls = [...lines, L("2026-01-01", "990", 10000, 0), L("2026-12-31", "990-AD", 0, 1000)];
    const tb = trialBalance(ls, accs);
    const sch = assetSchedule(tb);
    const b = sch.find((a) => a.row.code === "990")!;
    expect(b.row.balance).toBe(10000);
    expect(b.acc).toBe(1000);
    expect(b.nbv).toBe(9000);
    expect(sch.some((a) => a.row.code === "990-AD")).toBe(false);
    expect(sch.find((a) => a.row.code === "1000")!.acc).toBe(0);
  });
  it("journal must balance", () => {
    expect(journalBalanced([{ debit: 50, credit: 0 }, { debit: 0, credit: 50 }]).ok).toBe(true);
    expect(journalBalanced([{ debit: 50, credit: 0 }, { debit: 0, credit: 40 }]).ok).toBe(false);
  });
});
