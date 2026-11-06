export interface ReceiptConfig {
  paper_width: "58mm" | "80mm";
  item_layout: "standard" | "compact";
  show_logo: boolean;
  show_address: boolean;
  show_phone: boolean;
  show_email: boolean;
  show_tax_number: boolean;
  show_cashier: boolean;
  show_customer: boolean;
  show_other_currencies: boolean;
  show_barcode: boolean;
  return_policy: string;
}

export const RECEIPT_DEFAULTS: ReceiptConfig = {
  paper_width: "58mm",
  item_layout: "standard",
  show_logo: true,
  show_address: true,
  show_phone: true,
  show_email: false,
  show_tax_number: true,
  show_cashier: true,
  show_customer: true,
  show_other_currencies: true,
  show_barcode: true,
  return_policy: "",
};

export function receiptConfig(raw: unknown): ReceiptConfig {
  const o = raw && typeof raw === "object" ? (raw as Partial<ReceiptConfig>) : {};
  const c = { ...RECEIPT_DEFAULTS, ...o };
  if (c.paper_width !== "80mm") c.paper_width = "58mm";
  if (c.item_layout !== "compact") c.item_layout = "standard";
  return c;
}
