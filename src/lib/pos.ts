export type Currency = "USD" | "ZiG" | "ZAR";
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
  exchange_rate?: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function saleStockError(name: string, requested: number, available: number) {
  if (!Number.isFinite(requested) || requested <= 0) return "Enter a positive quantity";
  if (!Number.isFinite(available) || available <= 0) return `${name}: out of stock`;
  return requested > available ? `${name}: only ${available} available` : null;
}

export function cartSubtotal(lines: CartLine[]) {
  return round2(lines.reduce((s, l) => s + round2(l.unit_price * l.quantity), 0));
}

/** Discount resolved to USD; never exceeds subtotal. */
export function resolveDiscount(subtotal: number, kind: "percent" | "fixed", value: number) {
  if (!value || value < 0) return 0;
  const d = kind === "percent" ? (subtotal * Math.min(value, 100)) / 100 : value;
  return round2(Math.min(d, subtotal));
}

export function currencyRate(currency: Currency, zigRate: number, randRate = 0) {
  const rate = currency === "USD" ? 1 : currency === "ZiG" ? zigRate : randRate;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Set a positive ${currency} exchange rate`);
  return rate;
}

export function toUSD(amount: number, currency: Currency, zigRate: number, randRate = 0) {
  return amount / currencyRate(currency, zigRate, randRate);
}

export function fromUSD(amountUSD: number, currency: Currency, zigRate: number, randRate = 0) {
  return round2(amountUSD * currencyRate(currency, zigRate, randRate));
}

export function paidUSD(payments: Payment[], zigRate: number, randRate = 0) {
  return round2(payments.reduce((s, p) => s + (p.exchange_rate ? (p.amount || 0) / p.exchange_rate : toUSD(p.amount || 0, p.currency, zigRate, randRate)), 0));
}

export function changeDueUSD(totalUSD: number, payments: Payment[], zigRate: number, randRate = 0) {
  return round2(paidUSD(payments, zigRate, randRate) - totalUSD);
}

export function requireFullPayment(total: number, payments: Payment[], zigRate: number, randRate = 0) {
  if (!Number.isFinite(total) || total < 0 || payments.some((p) => !Number.isFinite(p.amount) || p.amount < 0 || (p.exchange_rate !== undefined && (!Number.isFinite(p.exchange_rate) || p.exchange_rate <= 0)))) {
    throw new Error("Invalid payment amount");
  }
  const paid = paidUSD(payments, zigRate, randRate);
  if (!Number.isFinite(paid) || Math.round(paid * 100) < Math.round(total * 100)) {
    throw new Error("Take full payment before finishing an offline sale");
  }
}

export function money(amount: number, currency: Currency = "USD") {
  const v = Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `$${v}` : currency === "ZAR" ? `R ${v}` : `ZiG ${v}`;
}

/** Built-in labels, kept so records made before payment types were editable still read correctly. */
export const methodLabels: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  card: "Card",
  ecocash: "EcoCash",
  bank: "Bank transfer",
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
