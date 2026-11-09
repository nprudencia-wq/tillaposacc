import { describe, expect, it } from "vitest";
import { DRAWER_KICK, receiptBytes, row, logoRaster } from "./escpos";
import { RECEIPT_DEFAULTS } from "./receipt-config";

const r = { sale_number: "S-1", created_at: new Date().toISOString(), business: "Shop", cashier: "Ann", currency: "USD" as const, rate: 1,
  items: [{ name: "Bread", quantity: 2, unit_price: 1, line_total: 2 }], subtotal: 2, discount: 0, total: 2, change: 0,
  payments: [{ method: "cash", currency: "USD" as const, amount: 2 }] };

describe("escpos", () => {
  it("includes an uploaded logo only when logo printing is enabled", () => {
    const logo = logoRaster(2, 1, new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]));
    expect(Array.from(logo)).toEqual([29, 118, 48, 0, 1, 0, 1, 0, 128]);
    expect(Buffer.from(receiptBytes(r, undefined, RECEIPT_DEFAULTS, { logo })).includes(Buffer.from(logo))).toBe(true);
    expect(Buffer.from(receiptBytes(r, undefined, { ...RECEIPT_DEFAULTS, show_logo: false }, { logo })).includes(Buffer.from(logo))).toBe(false);
  });
  it("pads rows to 32 columns on 58mm", () => expect(row("Total", "$2.00", 32)).toHaveLength(32));
  it("adds drawer kick only when asked", () => {
    const has = (b: Uint8Array) => Buffer.from(b).includes(Buffer.from(DRAWER_KICK));
    expect(has(receiptBytes(r, undefined, RECEIPT_DEFAULTS, { kick: true }))).toBe(true);
    expect(has(receiptBytes(r, undefined, RECEIPT_DEFAULTS))).toBe(false);
  });
});
