import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReceiptActions, type ReceiptData } from "@/components/Receipt";
import { money, type Currency, type PayMethod } from "@/lib/pos";
import { methodLabel } from "@/lib/payment-types";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [{ title: "Sales — Tilla POS" }, { name: "description", content: "Sales history and receipt reprints." }, { property: "og:title", content: "Sales — Tilla POS" }, { property: "og:description", content: "Sales history and receipt reprints." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SalesPage,
});

function SalesPage() {
  const { data: settings } = useSettings();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [refundFor, setRefundFor] = useState<{ id: string; sale_number: string } | null>(null);
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "list", from, to],
    queryFn: async () => {
      let q = supabase.from("sales").select("*").order("created_at", { ascending: false });
      if (from) q = q.gte("created_at", new Date(from + "T00:00:00").toISOString());
      if (to) q = q.lte("created_at", new Date(to + "T23:59:59.999").toISOString());
      return (await q.limit(from || to ? 1000 : 200)).data ?? [];
    },
  });
  const { data: staff = {} } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => Object.fromEntries(((await supabase.from("profiles").select("id, full_name")).data ?? []).map((p) => [p.id, p.full_name])),
  });

  const { data: unverified = [] } = useQuery({
    queryKey: ["sales", "unverified"],
    enabled: !!me?.canRefund,
    queryFn: async () => (await supabase.from("sale_payments").select("id, method, currency, amount, sales(sale_number, created_at)").eq("verified", false).limit(100)).data ?? [],
  });
  async function verify(id: string) {
    const { error } = await supabase.rpc("verify_payment", { p_payment: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Payment confirmed");
    qc.invalidateQueries({ queryKey: ["sales", "unverified"] });
  }

  async function reprint(s: (typeof sales)[number]) {
    const [{ data: items }, { data: pays }] = await Promise.all([
      supabase.from("sale_items").select("*").eq("sale_id", s.id),
      supabase.from("sale_payments").select("*").eq("sale_id", s.id),
    ]);
    setReceipt({
      sale_number: s.sale_number, created_at: s.created_at, business: settings?.business_name ?? "",
      cashier: staff[s.cashier_id] ?? "", currency: s.currency as Currency, rate: Number(s.exchange_rate),
      items: (items ?? []).map((i) => ({ name: i.name, quantity: Number(i.quantity), unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
      subtotal: Number(s.subtotal), discount: Number(s.discount), total: Number(s.total), change: Number(s.change_given),
      payments: (pays ?? []).map((p) => ({ method: p.method as PayMethod, currency: p.currency as Currency, amount: Number(p.amount) })),
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Sales</h1>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label htmlFor="sales-from">From</Label><Input id="sales-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="bg-card" /></div>
        <div className="space-y-1.5"><Label htmlFor="sales-to">To</Label><Input id="sales-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="bg-card" /></div>
        {(from || to) && <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</Button>}
        <p className="pb-2 text-sm text-muted-foreground">{from || to ? `Up to 1000 sales in the chosen dates` : "Latest 200 transactions"}</p>
      </div>
      {unverified.length > 0 && (
        <div className="mt-6 rounded-xl border border-warning bg-warning/10 p-4">
          <h2 className="font-semibold">Offline payments to check ({unverified.length})</h2>
          <p className="text-sm text-muted-foreground">These non-cash payments were taken while offline. Confirm each one against your card machine or EcoCash statement.</p>
          <div className="mt-3 space-y-2">
            {unverified.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-card p-2 text-sm">
                <span>{p.sales?.sale_number} · {methodLabel(p.method)} · {money(Number(p.amount), p.currency as Currency)}</span>
                <Button size="sm" variant="outline" onClick={() => verify(p.id)}>Confirm received</Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead>Transaction</TableHead><TableHead>Date</TableHead><TableHead>Cashier</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Total (USD)</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {sales.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="tabular font-medium">{s.sale_number}{s.offline && <Badge variant="outline" className="ml-2">Offline</Badge>}</TableCell>
                <TableCell className="text-sm">{new Date(s.created_at).toLocaleString()}</TableCell>
                <TableCell>{staff[s.cashier_id] ?? "—"}</TableCell>
                <TableCell>{s.currency}</TableCell>
                <TableCell className="tabular text-right">{money(Number(s.total))}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {s.status !== "completed" && <Badge variant="outline" className="mr-2">{s.status === "refunded" ? "Refunded" : "Part refunded"}</Badge>}
                  <Button size="sm" variant="outline" onClick={() => reprint(s)}>Receipt</Button>
                  {me?.canRefund && s.status !== "refunded" && <Button size="sm" variant="ghost" className="ml-1 text-destructive" onClick={() => setRefundFor(s)}>Refund</Button>}
                </TableCell>
              </TableRow>
            ))}
            {!sales.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No sales yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {refundFor && <RefundDialog sale={refundFor} onClose={() => setRefundFor(null)} />}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt</DialogTitle></DialogHeader>
          {receipt && <ReceiptActions r={receipt} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RefundDialog({ sale, onClose }: { sale: { id: string; sale_number: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["sale-items", sale.id],
    queryFn: async () => (await supabase.from("sale_items").select("*").eq("sale_id", sale.id)).data ?? [],
  });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { data, error } = await supabase.rpc("refund_sale", {
      p_sale: sale.id,
      p_items: Object.entries(qty).map(([sale_item_id, quantity]) => ({ sale_item_id, quantity })) as never,
      p_reason: reason, p_method: "cash",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Refunded ${money(Number((data as { amount: number }).amount))} — stock returned`);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Refund {sale.sale_number}</DialogTitle></DialogHeader>
        {items.map((i) => {
          const left = Number(i.quantity) - Number(i.refunded_qty);
          return (
            <div key={i.id} className="flex items-center gap-3">
              <div className="flex-1 text-sm"><div className="font-medium">{i.name}</div><div className="text-xs text-muted-foreground">{left} of {Number(i.quantity)} refundable · {money(Number(i.unit_price))}</div></div>
              <Input type="number" min={0} max={left} disabled={left <= 0} className="w-20" value={qty[i.id] || ""}
                onChange={(e) => setQty({ ...qty, [i.id]: Math.min(left, Math.max(0, Number(e.target.value))) })} />
            </div>
          );
        })}
        <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged bottle" /></div>
        <Button variant="destructive" disabled={busy || !reason} onClick={save}>Process refund</Button>
      </DialogContent>
    </Dialog>
  );
}
