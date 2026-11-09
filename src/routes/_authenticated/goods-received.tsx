import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/pos";
import { ReceiveGoods } from "./suppliers";

export const Route = createFileRoute("/_authenticated/goods-received")({
  head: () => ({ meta: [{ title: "Goods received — Tilla POS" }, { name: "description", content: "Record supplier deliveries with quantity, cost price and date." }, { property: "og:title", content: "Goods received — Tilla POS" }, { property: "og:description", content: "Record supplier deliveries with quantity, cost price and date." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: GoodsReceivedPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

function GoodsReceivedPage() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return iso(d); });
  const [to, setTo] = useState(() => iso(new Date()));
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["goods-received", from, to],
    queryFn: async () => {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59.999").toISOString();
      const [{ data: grns, error }, { data: sup }] = await Promise.all([
        supabase.from("grns").select("*, grn_items(id, name, quantity, unit_cost, line_total)").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }),
        supabase.from("suppliers").select("id, name").order("name"),
      ]);
      if (error) throw error;
      return { grns: grns ?? [], suppliers: sup ?? [] };
    },
  });
  const supName = (id: string) => data?.suppliers.find((s) => s.id === id)?.name ?? "—";
  const total = (data?.grns ?? []).reduce((a, g) => a + Number(g.total), 0);
  const units = (data?.grns ?? []).reduce((a, g) => a + g.grn_items.reduce((b, i) => b + Number(i.quantity), 0), 0);

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Goods received</h1>
          <p className="text-muted-foreground">Each delivery adds stock and counts as purchases in the income statement.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!data?.suppliers.length}><PackagePlus className="h-4 w-4" />Receive goods</Button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label htmlFor="gr-from">From</Label><Input id="gr-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="bg-card" /></div>
        <div className="space-y-1.5"><Label htmlFor="gr-to">To</Label><Input id="gr-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="bg-card" /></div>
        <div className="ml-auto flex gap-6 rounded-xl border bg-card px-4 py-2 shadow-soft">
          <div><div className="text-xs text-muted-foreground">Deliveries</div><div className="tabular text-lg font-bold">{data?.grns.length ?? 0}</div></div>
          <div><div className="text-xs text-muted-foreground">Units</div><div className="tabular text-lg font-bold">{units}</div></div>
          <div><div className="text-xs text-muted-foreground">Purchases</div><div className="tabular text-lg font-bold">{money(total)}</div></div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead /><TableHead>GRN</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead className="text-right">Items</TableHead><TableHead className="text-right">Total (USD)</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.grns ?? []).map((g) => (
              <Fragment key={g.id}>
                <TableRow className="cursor-pointer" onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                  <TableCell>{expanded === g.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell className="tabular font-medium">{g.grn_number}</TableCell>
                  <TableCell>{new Date(g.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{supName(g.supplier_id)}</TableCell>
                  <TableCell>{g.invoice_number ?? "—"}</TableCell>
                  <TableCell className="tabular text-right">{g.grn_items.length}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{money(Number(g.total))}</TableCell>
                </TableRow>
                {expanded === g.id && g.grn_items.map((i) => (
                  <TableRow key={i.id} className="bg-muted/40 text-sm">
                    <TableCell /><TableCell colSpan={3}>{i.name}</TableCell>
                    <TableCell className="tabular">{Number(i.quantity)} × {money(Number(i.unit_cost))}</TableCell>
                    <TableCell /><TableCell className="tabular text-right">{money(Number(i.line_total))}</TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
            {!data?.grns.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No deliveries in these dates.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {open && <ReceiveGoods draft={null} suppliers={data?.suppliers ?? []} onClose={() => setOpen(false)} />}
    </div>
  );
}
