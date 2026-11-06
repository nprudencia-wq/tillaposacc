// Pure ESC/POS byte builder (no browser APIs) so it can be unit-tested.
import type { ReceiptData } from "@/components/Receipt";
import type { ReceiptConfig } from "@/lib/receipt-config";

const ESC = 0x1b, GS = 0x1d;
export const DRAWER_KICK = new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xfa]); // pin 2, ~50ms/500ms
export const CUT = new Uint8Array([GS, 0x56, 0x42, 0x00]);

export function columnsFor(width: "58mm" | "80mm") { return width === "80mm" ? 48 : 32; }

// Printers use single-byte code pages; replace anything outside ASCII.
export function ascii(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e\n]/g, "?");
}

export function row(left: string, right: string, cols: number) {
  const l = ascii(left), r = ascii(right);
  const space = cols - r.length - 1;
  if (l.length <= space) return l + " ".repeat(cols - l.length - r.length) + r;
  return l.slice(0, cols) + "\n" + " ".repeat(Math.max(0, cols - r.length)) + r;
}

export class EscPos {
  private parts: number[] = [];
  raw(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.parts.push(b[i] as number); return this; }
  init() { return this.raw([ESC, 0x40]); }
  align(a: "left" | "center") { return this.raw([ESC, 0x61, a === "center" ? 1 : 0]); }
  bold(on: boolean) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  big(on: boolean) { return this.raw([GS, 0x21, on ? 0x11 : 0x00]); }
  text(s: string) { const t = ascii(s); for (let i = 0; i < t.length; i++) this.parts.push(t.charCodeAt(i)); return this; }
  line(s = "") { return this.text(s + "\n"); }
  feed(n: number) { return this.raw([ESC, 0x64, n]); }
  bytes() { return new Uint8Array(this.parts); }
}

export type StoreInfo = {
  business_name?: string | null; address?: string | null; phone?: string | null; email?: string | null;
  tax_number?: string | null; receipt_footer?: string | null; vat_enabled?: boolean | null; vat_rate?: number | null;
};

const fmt = (n: number, cur: string) => `${cur === "USD" ? "$" : cur === "ZAR" ? "R" : "ZiG "}${n.toFixed(2)}`;

export function receiptBytes(r: ReceiptData, store: StoreInfo | undefined, c: ReceiptConfig, opts: { cut?: boolean; kick?: boolean } = {}) {
  const cols = columnsFor(c.paper_width);
  const dash = "-".repeat(cols);
  const cv = (usd: number) => (r.currency !== "USD" ? usd * r.rate : usd);
  const p = new EscPos().init().align("center").bold(true).line(store?.business_name || r.business).bold(false);
  if (c.show_address && store?.address) p.line(store.address);
  if (c.show_phone && store?.phone) p.line(`Tel: ${store.phone}`);
  if (c.show_email && store?.email) p.line(store.email);
  if (c.show_tax_number && store?.tax_number) p.line(`VAT/TIN: ${store.tax_number}`);
  p.align("left").line(dash).line(row("Receipt", r.sale_number, cols))
    .line(row("Date", new Date(r.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }), cols));
  if (c.show_cashier) p.line(row("Cashier", r.cashier, cols));
  if (c.show_customer && r.customer) p.line(row("Customer", r.customer, cols));
  p.line(dash);
  for (const i of r.items) {
    if (c.item_layout === "compact") p.line(row(i.name, `${i.quantity} ${fmt(cv(i.line_total), r.currency)}`, cols));
    else p.line(ascii(i.name).slice(0, cols)).line(row(`  ${i.quantity} x ${fmt(cv(i.unit_price), r.currency)}`, fmt(cv(i.line_total), r.currency), cols));
  }
  p.line(dash).line(row("Subtotal", fmt(cv(r.subtotal), r.currency), cols));
  if (r.discount > 0) p.line(row("Discount", `-${fmt(cv(r.discount), r.currency)}`, cols));
  p.bold(true).line(row(`TOTAL (${r.currency})`, fmt(cv(r.total), r.currency), cols)).bold(false);
  if (store?.vat_enabled && Number(store.vat_rate) > 0) {
    const t = cv(r.total), rate = Number(store.vat_rate), vat = t - t / (1 + rate / 100);
    p.line(row(`VAT ${rate}% (incl.)`, fmt(vat, r.currency), cols));
  }
  p.line(dash);
  for (const pay of r.payments) p.line(row(`${pay.method} (${pay.currency})`, fmt(pay.amount, pay.currency), cols));
  p.bold(true).line(row("Change", fmt(cv(r.change), r.currency), cols)).bold(false);
  if (c.return_policy) p.line(dash).align("center").line(c.return_policy);
  p.align("center").line("").line(store?.receipt_footer || "Thank you for shopping with us!").feed(4);
  if (opts.cut !== false) p.raw(CUT);
  if (opts.kick) p.raw(DRAWER_KICK);
  return p.bytes();
}
