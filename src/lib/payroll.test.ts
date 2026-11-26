import { describe, expect, it } from "vitest";
import { calcPay, paye } from "./payroll";

describe("Zimbabwe payroll", () => {
  it("charges no PAYE on the first $100", () => { expect(paye(100)).toBe(0); });
  it("uses the 20% band up to $300", () => { expect(paye(300)).toBe(40); });
  it("uses the 40% band above $3,000", () => { expect(paye(4000)).toBe(1265); });
  it("deducts 4.5% NSSA before PAYE and adds 3% AIDS levy", () => {
    const p = calcPay({ basic: 500, allowances: 0 });
    expect(p.nssa_employee).toBe(22.5);
    expect(p.paye).toBe(84.38);
    expect(p.aids_levy).toBe(2.53);
    expect(p.net).toBe(390.59);
  });
  it("caps NSSA at the insurable ceiling", () => { expect(calcPay({ basic: 2000, allowances: 0 }).nssa_employee).toBe(31.5); });
  it("takes advances off net pay", () => { expect(calcPay({ basic: 100, allowances: 0, advances: 20, nssaExempt: true }).net).toBe(80); });
});
