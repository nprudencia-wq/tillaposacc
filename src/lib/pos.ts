export type Currency = "USD" | "ZiG";
/** A payment type code, e.g. "cash" or "ecocash". The shop's own list lives in payment_types. */
export type PayMethod = string;

export interface CartLine {
  product_id: string;
  name: string;
  unit_price: number; // USD
  quantity: number;
  stock: number;
}

export interface Payment {
  method: PayMethod;
  currency: Currency;
  amount: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function cartSubtotal(lines: CartLine[]) {
  return round2(lines.reduce((s, l) => s + round2(l.unit_price * l.quantity), 0));
}

/** Discount resolved to USD; never exceeds subtotal. */
export function resolveDiscount(subtotal: number, kind: "percent" | "fixed", value: number) {
  if (!value || value < 0) return 0;
  const d = kind === "percent" ? (subtotal * Math.min(value, 100)) / 100 : value;
  return round2(Math.min(d, subtotal));
}

export function toUSD(amount: number, currency: Currency, zigRate: number) {
  return currency === "ZiG" ? amount / zigRate : amount;
}

export function fromUSD(amountUSD: number, currency: Currency, zigRate: number) {
  return round2(currency === "ZiG" ? amountUSD * zigRate : amountUSD);
}

/** Total paid in USD across split payments. */
export function paidUSD(payments: Payment[], zigRate: number) {
  return round2(payments.reduce((s, p) => s + toUSD(p.amount || 0, p.currency, zigRate), 0));
}

/** Change due, in USD (negative = still owed). */
export function changeDueUSD(totalUSD: number, payments: Payment[], zigRate: number) {
  return round2(paidUSD(payments, zigRate) - totalUSD);
}

export function money(amount: number, currency: Currency = "USD") {
  const v = Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `$${v}` : `ZiG ${v}`;
}

export const methodLabels: Record<PayMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  card: "Card",
};

export const roleLabels: Record<string, string> = {
  admin: "System Administrator",
  owner: "Business Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  cashier: "Cashier",
  stock_controller: "Stock Controller",
  accountant: "Accountant",
};

export const STOCK_ROLES = ["admin", "owner", "manager", "stock_controller"];
