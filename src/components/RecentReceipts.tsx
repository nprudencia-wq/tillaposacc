import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReceiptActions, Receipt, type ReceiptData } from "@/components/Receipt";
import { cached, localReceipts } from "@/lib/offline";
import { printReceipt } from "@/components/SaleComplete";
import { Printer } from "lucide-react";
import { RefundDialog } from "@/components/RefundDialog";
import { money, type Currency, type PayMethod } from "@/lib/pos";
import { methodLabel } from "@/lib/payment-types";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { toast } from "sonner";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Sale = { id: string; sale_number: string; created_at: string; cashier_id: string; currency: string; exchange_rate: number; subtotal: number; discount: number; total: number; change_given: number; cashier_name?: string; sale_payments: { method: string; currency: string; amount: number }[] | null; sale_items?: { name: string; quantity: number; unit_price: number; line_total: number; refunded_qty: number }[] };

/** Till-side past receipts (Salesplay-style): pick a day, search, view, reprint, share and refund. */
export function RecentReceipts({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: settings } = useSettings();
  const { data: me } = useStaff();
  const [q, setQ] = useState("");
  const [day, setDay] = useState(localDay());
  const [mine, setMine] = useState(true);
  const [current, setCurrent] = useState<{ sale: Sale; receipt: ReceiptData; refundable: boolean } | null>(null);
  const [refundFor, setRefundFor] = useState<{ id: string; sale_number: string } | null>(null);
  const [localCurrent, setLocalCurrent] = useState<ReceiptData | null>(null);
  const { data: saved = [] } = useQuery({ queryKey: ["local-receipts", me?.id, open], enabled: open, queryFn: localReceipts });
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", "till-receipts", day, mine, me?.id, q.trim()],
    enabled: open,
    // Whole receipts (lines, payments, cashier name) are downloaded and kept on the till, so they open offline.
    queryFn: () => cached(`till-receipts:${day}:${mine ? me?.id : "all"}:${q.trim().toLowerCase()}`, async () => {
      let query = supabase.from("sales").select("id, sale_number, created_at, cashier_id, currency, exchange_rate, subtotal, discount, total, change_given, sale_payments(method, currency, amount, reference), sale_items(name, quantity, unit_price, line_total, refunded_qty)").order("created_at", { ascending: false }).limit(200);
      const term = q.trim();
      if (term) query = query.ilike("sale_number", `%${term}%`);
      else if (day) query = query.gte("created_at", new Date(day + "T00:00:00").toISOString()).lte("created_at", new Date(day + "T23:59:59.999").toISOString());
      if (mine && me?.id) query = query.eq("cashier_id", me.id);
      const [{ data, error }, { data: profs }] = await Promise.all([query, supabase.from("profiles").select("id, full_name")]);
      if (error) throw error;
      const names = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      return ((data ?? []) as unknown as Sale[]).map((s) => ({ ...s, cashier_name: names.get(s.cashier_id) ?? "" }));
    }).catch(() => [] as Sale[]),
  });
  const savedNumbers = new Set(saved.map((r) => r.sale_number));
  const dayTotal = sales.reduce((s, x) => s + Number(x.total), 0);

  function view(s: Sale) {
    const items = s.sale_items, pays = s.sale_payments;
    if (!items) { toast.error("Couldn't load that receipt"); return; }
    const prof = { full_name: s.cashier_name };
    setCurrent({
      sale: s,
      refundable: (items ?? []).some((i) => Number(i.quantity) > Number(i.refunded_qty)),
      receipt: {
        sale_number: s.sale_number, created_at: s.created_at, business: settings?.business_name ?? "",
        cashier: prof?.full_name ?? "", currency: s.currency as Currency, rate: Number(s.exchange_rate),
        items: (items ?? []).map((i) => ({ name: i.name, quantity: Number(i.quantity), unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
        subtotal: Number(s.subtotal), discount: Number(s.discount), total: Number(s.total), change: Number(s.change_given),
        payments: (pays ?? []).map((p) => ({ method: p.method as PayMethod, currency: p.currency as Currency, amount: Number(p.amount) })),
      },
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setCurrent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{current ? `Receipt ${current.receipt.sale_number}` : "Receipts"}</DialogTitle></DialogHeader>
          {current ? (
            <div className="space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setCurrent(null)}><ArrowLeft className="h-4 w-4" />Back to receipts</Button>
              <ReceiptActions r={current.receipt} />
              {me?.canRefund && (
                <Button variant="outline" className="w-full" disabled={!current.refundable} onClick={() => setRefundFor({ id: current.sale.id, sale_number: current.sale.sale_number })}>
                  <Undo2 className="h-4 w-4" />{current.refundable ? "Refund / return items" : "Fully refunded"}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Receipt number" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <Input type="date" aria-label="Receipt date" className="w-40" value={day} max={localDay()} onChange={(e) => setDay(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="inline-flex rounded-md border p-0.5">
                  <Button size="sm" variant={mine ? "default" : "ghost"} onClick={() => setMine(true)}>My receipts</Button>
                  <Button size="sm" variant={!mine ? "default" : "ghost"} onClick={() => setMine(false)}>All cashiers</Button>
                </div>
                <span className="text-muted-foreground">{sales.length} · {money(dayTotal)}</span>
              </div>
              <div className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
                {saved.filter((r) => !sales.some((s) => s.sale_number === r.sale_number)).filter((r) => (!q.trim() || r.sale_number.toLowerCase().includes(q.trim().toLowerCase())) && (!day || localDay(new Date(r.created_at)) === day)).map((r) => (
                  <Button key={r.sale_number} variant="ghost" className="h-auto w-full justify-between whitespace-normal p-3 text-left" onClick={() => setLocalCurrent(r)}><span className="min-w-0 break-all">{r.sale_number}<br /><span className="text-xs text-muted-foreground">Saved on this till</span></span><span>{money(r.total)}</span></Button>
                ))}
                {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
                {!isLoading && sales.length === 0 && <p className="p-3 text-sm text-muted-foreground">No receipts for this day. Sales saved offline appear after they upload.</p>}
                {sales.map((s) => {
                  const cur = s.currency as Currency;
                  const amt = cur !== "USD" ? Number(s.total) * Number(s.exchange_rate) : Number(s.total);
                  const paidBy = [...new Set((s.sale_payments ?? []).map((p) => methodLabel(p.method)))].join(", ");
                  return (
                    <button key={s.id} className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted" onClick={() => view(s)}>
                      <span><span className="font-medium">{s.sale_number}</span><br /><span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{q.trim() ? ` · ${new Date(s.created_at).toLocaleDateString()}` : ""}{paidBy ? ` · ${paidBy}` : ""}</span></span>
                      <span className="font-medium">{money(amt, cur)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!localCurrent} onOpenChange={(o) => { if (!o) setLocalCurrent(null); }}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Saved receipt</DialogTitle></DialogHeader>
          {localCurrent && <><Button onClick={() => void printReceipt(localCurrent, settings)}><Printer className="h-4 w-4" />Print Receipt</Button><div className="max-h-[60vh] overflow-auto"><Receipt r={localCurrent} /></div></>}
        </DialogContent>
      </Dialog>
      {refundFor && <RefundDialog sale={refundFor} onClose={() => { setRefundFor(null); setCurrent(null); }} />}
    </>
  );
}
