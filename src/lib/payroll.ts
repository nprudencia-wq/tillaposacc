// Zimbabwe monthly payroll (USD). Review these figures when ZIMRA or NSSA publish new rates.
export const NSSA_RATE = 0.045; // employee and employer each
export const NSSA_CEILING = 700; // monthly insurable earnings cap, USD
export const AIDS_LEVY_RATE = 0.03; // of PAYE
/** ZIMRA monthly USD PAYE bands: [upper limit, rate, amount deducted]. */
export const PAYE_BANDS: [number, number, number][] = [
  [100, 0, 0], [300, 0.2, 20], [1000, 0.25, 35], [2000, 0.3, 85], [3000, 0.35, 185], [Infinity, 0.4, 335],
];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function paye(taxable: number) {
  if (taxable <= 0) return 0;
  const band = PAYE_BANDS.find(([limit]) => taxable <= limit) ?? PAYE_BANDS[PAYE_BANDS.length - 1]!;
  return r2(Math.max(0, taxable * band[1] - band[2]));
}

export type PayInput = { basic: number; allowances: number; bonus?: number; advances?: number; nssaExempt?: boolean; payeExempt?: boolean };
export function calcPay(p: PayInput) {
  const gross = r2(p.basic + p.allowances + (p.bonus ?? 0));
  const insurable = Math.min(gross, NSSA_CEILING);
  const nssa_employee = p.nssaExempt ? 0 : r2(insurable * NSSA_RATE);
  const nssa_employer = nssa_employee;
  const tax = p.payeExempt ? 0 : paye(gross - nssa_employee);
  const aids_levy = r2(tax * AIDS_LEVY_RATE);
  const advances = r2(p.advances ?? 0);
  const net = r2(gross - nssa_employee - tax - aids_levy - advances);
  return { gross, nssa_employee, nssa_employer, paye: tax, aids_levy, advances, net };
}
