export type DocumentLine = { product_id: string; name: string; quantity: number; unit_price: number; line_total: number };

export function documentTotals(lines: DocumentLine[], discount: number) {
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unit_price) || line.unit_price < 0)) throw new Error("Enter valid quantities and prices");
  const subtotal = Math.round(lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price * 100) / 100, 0) * 100) / 100;
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw new Error("Invalid discount");
  return { subtotal, total: Math.round((subtotal - discount) * 100) / 100 };
}

export function creditLines(lines: DocumentLine[], amount: number) {
  const raw = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  if (raw <= 0) return lines;
  let assigned = 0;
  return lines.map((line, index) => {
    const value = index === lines.length - 1 ? Math.round((amount - assigned) * 100) / 100 : Math.round(line.quantity * line.unit_price / raw * amount * 100) / 100;
    assigned += value;
    return { ...line, line_total: value };
  });
}