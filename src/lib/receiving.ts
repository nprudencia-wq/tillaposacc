export type InvoiceCurrency = "USD" | "ZiG" | "ZAR";
export type ReceivingLine = { product_id: string; quantity: string; unit_cost: string };
export const blankReceivingLine = (): ReceivingLine => ({ product_id: "", quantity: "", unit_cost: "" });
export function suggestedReceivingCost(productId: string, lines: ReceivingLine[], productCostUSD: number, rate: number) {
  const previous = lines.findLast((line) => line.product_id === productId && line.unit_cost.trim() !== "" && Number.isFinite(Number(line.unit_cost)) && Number(line.unit_cost) >= 0);
  if (previous) return previous.unit_cost;
  return Number.isFinite(rate) && rate > 0 && Number.isFinite(productCostUSD) && productCostUSD >= 0
    ? String(Math.round(productCostUSD * rate * 100) / 100) : "";
}
export function repriceReceivingLines(lines: ReceivingLine[], oldRate: number, newRate: number, costUSD: (id: string) => number) {
  return lines.map((line) => {
    if (!line.product_id) return line;
    const usd = oldRate > 0 && line.unit_cost.trim() !== "" ? Number(line.unit_cost) / oldRate : costUSD(line.product_id);
    return { ...line, unit_cost: newRate > 0 && Number.isFinite(newRate) && Number.isFinite(usd) ? String(Math.round(usd * newRate * 100) / 100) : "" };
  });
}
export function completeReceivingLine(line: ReceivingLine) {
  return !!line.product_id && line.quantity.trim() !== "" && Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0 && line.unit_cost.trim() !== "" && Number.isFinite(Number(line.unit_cost)) && Number(line.unit_cost) >= 0;
}
export function updateReceivingLine(lines: ReceivingLine[], index: number, patch: Partial<ReceivingLine>) {
  const next = lines.map((line, i) => i === index ? { ...line, ...patch } : line);
  const last = next.at(-1);
  return last && completeReceivingLine(last) ? [...next, blankReceivingLine()] : next;
}
export function receivingTotal(lines: ReceivingLine[]) {
  return Math.round(lines.filter(completeReceivingLine).reduce((sum, line) => sum + Math.round(Number(line.quantity) * Number(line.unit_cost) * 100) / 100, 0) * 100) / 100;
}
export function invoiceUSD(amount: number, currency: InvoiceCurrency, rate: number) {
  if (!Number.isFinite(rate) || rate <= 0 || (currency === "USD" && rate !== 1)) throw new Error("Enter a valid exchange rate");
  return Math.round(amount / rate * 100) / 100;
}
export function stockCorrection(current: number, target: number, reason: string) {
  if (!Number.isFinite(target) || target < 0) throw new Error("Stock must be zero or positive");
  if (current !== target && !reason.trim()) throw new Error("Enter a reason for the stock correction");
  return target - current;
}
export function invoiceMoney(amount: number, currency: InvoiceCurrency) {
  const value = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency === "USD" ? "$" : currency === "ZAR" ? "R " : "ZiG "}${value}`;
}