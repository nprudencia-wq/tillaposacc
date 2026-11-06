import { toast } from "sonner";
import { Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, type Currency, type PayMethod } from "@/lib/pos";
import { methodLabel } from "@/lib/payment-types";
import { useSettings } from "@/hooks/use-staff";
import { vatBreakdown } from "@/lib/vat";
import { ZimraReceiptBlock } from "@/components/ZimraSettings";

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
  const cv = (usd: number) => (r.currency !== "USD" ? usd * r.rate : usd);
  const { data: st } = useSettings();
  return (
    <div id="receipt-print" className="mx-auto w-full max-w-[320px] bg-card p-4 font-mono text-xs text-card-foreground">
      <div className="text-center">
        {st?.logo_url && <img src={st.logo_url} alt="" className="mx-auto mb-1 max-h-16" />}
        <div className="text-sm font-bold">{st?.business_name || r.business}</div>
        {st?.address && <div>{st.address}</div>}
        {(st?.phone || st?.email) && <div>{[st?.phone, st?.email].filter(Boolean).join(" · ")}</div>}
        {st?.tax_number && <div>VAT/TIN: {st.tax_number}</div>}
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
      {r.currency !== "USD" && <div className="text-right opacity-70">= {money(r.total)} @ {r.rate}</div>}
      {st?.vat_enabled && (() => {
        const b = vatBreakdown(cv(r.total), Number(st.vat_rate));
        return (
          <div className="mt-1 opacity-80">
            <div className="flex justify-between"><span>Excl. VAT</span><span>{money(b.net, r.currency)}</span></div>
            <div className="flex justify-between"><span>VAT {Number(st.vat_rate)}% (incl.)</span><span>{money(b.vat, r.currency)}</span></div>
          </div>
        );
      })()}
      <div className="my-2 border-t border-dashed border-foreground/40" />
      {r.payments.map((p, k) => (
        <div key={k} className="flex justify-between"><span>{methodLabel(p.method)} ({p.currency})</span><span>{money(p.amount, p.currency)}</span></div>
      ))}
      <div className="flex justify-between font-bold"><span>Change</span><span>{money(cv(r.change), r.currency)}</span></div>
      <ZimraReceiptBlock saleNumber={r.sale_number} />
      <div className="mt-3 whitespace-pre-line text-center">{st?.receipt_footer || "Thank you for shopping with us!"}</div>
    </div>
  );
}

export function ReceiptActions({ r }: { r: ReceiptData }) {
  async function share() {
    const text = `${r.business}\n${r.sale_number}\nTotal: ${money(r.currency !== "USD" ? r.total * r.rate : r.total, r.currency)}\nThank you!`;
    if (navigator.share) await navigator.share({ title: r.sale_number, text }).catch(() => {});
    else { await navigator.clipboard.writeText(text); toast.success("Receipt copied"); }
  }
  return (
    <>
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border"><Receipt r={r} /></div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
        <Button variant="outline" className="flex-1" onClick={share}><Share2 className="h-4 w-4" />Share</Button>
      </div>
    </>
  );
}

