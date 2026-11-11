/** Daily straight-line proration; dates are ISO calendar dates, never journal dates. */
export function annualDepreciation(cost: number, accumulated: number, rate: number, start: string, year: number, asOf: string): number {
  if (!start || !asOf || !Number.isInteger(year) || year < 1 || year > 9998) return 0;
  const first = Date.parse(`${String(year).padStart(4, "0")}-01-01T00:00:00Z`);
  const next = Date.parse(`${String(year + 1).padStart(4, "0")}-01-01T00:00:00Z`);
  const used = Date.parse(`${start}T00:00:00Z`);
  const cutoff = Date.parse(`${asOf}T00:00:00Z`);
  if (![cost, accumulated, rate, used, cutoff].every(Number.isFinite)) return 0;
  const day = 86400000;
  const days = Math.max(0, (Math.min(next - day, cutoff) - Math.max(first, used)) / day + 1);
  return Math.round(Math.max(0, Math.min(cost - accumulated, cost * rate / 100 * days / ((next - first) / day))) * 100) / 100;
}