import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/use-staff";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReceiptActions, type ReceiptData } from "@/components/Receipt";
import { money, type Currency, type PayMethod } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [{ title: "Sales — Tilla POS" }, { name: "description", content: "Sales history and receipt reprints." }] }),
  component: SalesPage,
});

function SalesPage() {
  const { data: settings } = useSettings();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "list"],
    queryFn: async () => (await supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: staff = {} } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => Object.fromEntries(((await supabase.from("profiles").select("id, full_name")).data ?? []).map((p) => [p.id, p.full_name])),
  });

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
      <p className="text-muted-foreground">Latest 200 transactions</p>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead>Transaction</TableHead><TableHead>Date</TableHead><TableHead>Cashier</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Total (USD)</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {sales.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="tabular font-medium">{s.sale_number}</TableCell>
                <TableCell className="text-sm">{new Date(s.created_at).toLocaleString()}</TableCell>
                <TableCell>{staff[s.cashier_id] ?? "—"}</TableCell>
                <TableCell>{s.currency}</TableCell>
                <TableCell className="tabular text-right">{money(Number(s.total))}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => reprint(s)}>Receipt</Button></TableCell>
              </TableRow>
            ))}
            {!sales.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No sales yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt</DialogTitle></DialogHeader>
          {receipt && <ReceiptActions r={receipt} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
