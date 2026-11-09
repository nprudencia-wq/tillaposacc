import { toast } from "sonner";
import { Printer, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { money, type Currency, type PayMethod } from "@/lib/pos";
import { methodLabel } from "@/lib/payment-types";
import { useSettings } from "@/hooks/use-staff";
import { vatBreakdown } from "@/lib/vat";
import { receiptConfig, type ReceiptConfig } from "@/lib/receipt-config";
import { ZimraReceiptBlock } from "@/components/ZimraSettings";
import { ReceiptLogo } from "@/components/ReceiptLogo";

export interface ReceiptData {
  sale_number: string;
  created_at: string;
  business: string;
  cashier: string;
  customer?: string | null;
  currency: Currency;
  rate: number;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number;
  discount: number;
  total: number;
  change: number;
  payments: { method: PayMethod; currency: Currency; amount: number }[];
}

export type StoreLike = {
  business_name?: string | null; address?: string | null; phone?: string | null; email?: string | null;
  tax_number?: string | null; logo_url?: string | null; receipt_footer?: string | null;
  vat_enabled?: boolean | null; vat_rate?: number | null; zig_rate?: number | null; rand_rate?: number | null;
  receipt_config?: unknown;
};

const Line = () => <div className="my-1.5 border-t border-dashed border-foreground/50" />;
const Row = ({ l, r, b }: { l: React.ReactNode; r: React.ReactNode; b?: boolean }) => (
  <div className={`flex justify-between gap-2 ${b ? "font-bold" : ""}`}><span className="min-w-0 break-words">{l}</span><span className="shrink-0">{r}</span></div>
);

export function Receipt({ r, store, config }: { r: ReceiptData; store?: StoreLike; config?: ReceiptConfig }) {
  const { data: live } = useSettings();
  const st: StoreLike | undefined = store ?? (live as StoreLike | undefined);
  const c = config ?? receiptConfig(st?.receipt_config);
  const cv = (usd: number) => (r.currency !== "USD" ? usd * r.rate : usd);
  const narrow = c.paper_width === "58mm";
  const zig = Number(st?.zig_rate) || 0, rand = Number(st?.rand_rate) || 0;
  return (
    <div id="receipt-print" data-paper={c.paper_width}
      className={`mx-auto w-full bg-card p-3 font-mono text-card-foreground ${narrow ? "max-w-[230px] text-[10px] leading-snug" : "max-w-[320px] text-xs"}`}>
      <div className="text-center">
        {c.show_logo && st?.logo_url && <ReceiptLogo src={st.logo_url} className="mx-auto mb-1 max-h-14 max-w-full object-contain grayscale" />}
        <div className={`font-bold uppercase ${narrow ? "text-xs" : "text-sm"}`}>{st?.business_name || r.business}</div>
        {c.show_address && st?.address && <div>{st.address}</div>}
        {c.show_phone && st?.phone && <div>Tel: {st.phone}</div>}
        {c.show_email && st?.email && <div>{st.email}</div>}
        {c.show_tax_number && st?.tax_number && <div>VAT/TIN: {st.tax_number}</div>}
      </div>
      <Line />
      <div className="flex gap-2"><span className="shrink-0">Receipt</span><span className="min-w-0 flex-1 break-all text-right">{r.sale_number}</span></div>
      <Row l="Date" r={new Date(r.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} />
      {c.show_cashier && <Row l="Cashier" r={r.cashier} />}
      {c.show_customer && r.customer && <Row l="Customer" r={r.customer} />}
      <Line />
      {c.item_layout === "compact" ? (
        <>
          <div className="flex justify-between font-bold"><span>ITEM</span><span>QTY · TOTAL</span></div>
          {r.items.map((i, k) => <Row key={k} l={i.name} r={`${i.quantity} · ${money(cv(i.line_total), r.currency)}`} />)}
        </>
      ) : r.items.map((i, k) => (
        <div key={k} className="mb-1">
          <div>{i.name}</div>
          <Row l={`${i.quantity} × ${money(cv(i.unit_price), r.currency)}`} r={money(cv(i.line_total), r.currency)} />
        </div>
      ))}
      <Line />
      <Row l="Subtotal" r={money(cv(r.subtotal), r.currency)} />
      {r.discount > 0 && <Row l="Discount" r={`-${money(cv(r.discount), r.currency)}`} />}
      <div className={narrow ? "text-xs" : "text-sm"}><Row b l={`TOTAL (${r.currency})`} r={money(cv(r.total), r.currency)} /></div>
      {c.show_other_currencies && (
        <div className="opacity-80">
          {r.currency !== "USD" && <Row l="USD" r={money(r.total)} />}
          {r.currency !== "ZiG" && zig > 0 && <Row l={`ZiG @ ${zig}`} r={money(r.total * zig, "ZiG")} />}
          {r.currency !== "ZAR" && rand > 0 && <Row l={`Rand @ ${rand}`} r={money(r.total * rand, "ZAR")} />}
        </div>
      )}
      {st?.vat_enabled && (() => {
        const b = vatBreakdown(cv(r.total), Number(st.vat_rate));
        return (<><Line /><Row l="Excl. VAT" r={money(b.net, r.currency)} /><Row l={`VAT ${Number(st.vat_rate)}% (incl.)`} r={money(b.vat, r.currency)} /></>);
      })()}
      <Line />
      {r.payments.map((p, k) => <Row key={k} l={`${methodLabel(p.method)} (${p.currency})`} r={money(p.amount, p.currency)} />)}
      <Row b l="Change" r={money(cv(r.change), r.currency)} />
      {c.show_barcode && (
        <><Line /><div className="flex flex-col items-center gap-0.5"><QRCodeSVG value={r.sale_number} size={narrow ? 64 : 80} /><div>{r.sale_number}</div></div></>
      )}
      <ZimraReceiptBlock saleNumber={r.sale_number} />
      {c.return_policy && <><Line /><div className="whitespace-pre-line text-center">{c.return_policy}</div></>}
      <div className="mt-2 whitespace-pre-line text-center">{st?.receipt_footer || "Thank you for shopping with us!"}</div>
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
