import { money, methodLabels, type Currency, type PayMethod } from "@/lib/pos";

export interface ReceiptData {
  sale_number: string;
  created_at: string;
  business: string;
  cashier: string;
  currency: Currency;
  rate: number;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number;
  discount: number;
  total: number;
  change: number;
  payments: { method: PayMethod; currency: Currency; amount: number }[];
}

export function Receipt({ r }: { r: ReceiptData }) {
  const cv = (usd: number) => (r.currency === "ZiG" ? usd * r.rate : usd);
  return (
    <div id="receipt-print" className="mx-auto w-full max-w-[320px] bg-card p-4 font-mono text-xs text-card-foreground">
      <div className="text-center">
        <div className="text-sm font-bold">{r.business}</div>
        <div>{r.sale_number}</div>
        <div>{new Date(r.created_at).toLocaleString()}</div>
        <div>Cashier: {r.cashier}</div>
      </div>
      <div className="my-2 border-t border-dashed border-foreground/40" />
      {r.items.map((i, k) => (
        <div key={k} className="mb-1">
          <div>{i.name}</div>
          <div className="flex justify-between"><span>{i.quantity} × {money(cv(i.unit_price), r.currency)}</span><span>{money(cv(i.line_total), r.currency)}</span></div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-foreground/40" />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(cv(r.subtotal), r.currency)}</span></div>
      {r.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{money(cv(r.discount), r.currency)}</span></div>}
      <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{money(cv(r.total), r.currency)}</span></div>
      {r.currency === "ZiG" && <div className="text-right opacity-70">= {money(r.total)} @ {r.rate}</div>}
      <div className="my-2 border-t border-dashed border-foreground/40" />
      {r.payments.map((p, k) => (
        <div key={k} className="flex justify-between"><span>{methodLabels[p.method]} ({p.currency})</span><span>{money(p.amount, p.currency)}</span></div>
      ))}
      <div className="flex justify-between font-bold"><span>Change</span><span>{money(cv(r.change), r.currency)}</span></div>
      <div className="mt-3 text-center">Thank you for shopping with us!</div>
    </div>
  );
}
