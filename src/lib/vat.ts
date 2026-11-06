// VAT breakdown for VAT-inclusive shelf prices: the total already contains the VAT.
export function vatBreakdown(total: number, ratePct: number) {
  const rate = Math.max(0, Number(ratePct) || 0);
  const net = Math.round((total / (1 + rate / 100)) * 100) / 100;
  const vat = Math.round((total - net) * 100) / 100;
  return { net, vat };
}
