import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportPDF } from "@/lib/export";
import { matchDeposits } from "@/lib/deposits";

const d = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Africa/Harare", dateStyle: "medium", timeStyle: "short" });

export function DepositsTab({ from, to }: { from: string; to: string }) {
  const [show, setShow] = useState("unclaimed");
  const { data, isLoading } = useQuery({
    queryKey: ["bottle-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shift_cash_movements").select("id,type,reason,amount,currency,created_at").like("reason", "Bottle deposit%").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = useMemo(() => matchDeposits(data ?? []).filter((r) => {
    const day = new Date(r.taken).toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
    return day >= from && day <= to && (show === "all" || (show === "unclaimed" ? !r.claimed : !!r.claimed));
  }), [data, from, to, show]);
  const totals = rows.filter((r) => !r.claimed).reduce<Record<string, number>>((a, r) => ({ ...a, [r.currency]: (a[r.currency] ?? 0) + r.amount }), {});
  const exportRows = rows.map((r) => ({ who: r.who || "—", amount: `${r.currency} ${r.amount.toFixed(2)}`, taken: d(r.taken), claimed: r.claimed ? d(r.claimed) : "Not claimed", days: r.days }));

  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Bottle deposits taken {from} to {to}</h2>
        <div className="flex gap-2">
          <Select value={show} onValueChange={setShow}>
            <SelectTrigger className="w-40" aria-label="Show"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="unclaimed">Unclaimed</SelectItem><SelectItem value="claimed">Claimed</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportPDF(`deposits-${from}-${to}`, "Bottle deposits", `${from} to ${to} · ${show}`, [{ key: "who", label: "Customer / bottles" }, { key: "amount", label: "Amount" }, { key: "taken", label: "Taken" }, { key: "claimed", label: "Claimed" }, { key: "days", label: "Days" }], exportRows)}>
            <FileDown className="mr-1 h-4 w-4" />PDF
          </Button>
        </div>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">Refunds are matched to the oldest open deposit with the same amount and currency (and the same note when one was typed). Still held: {Object.entries(totals).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(", ") || "nothing"}. To keep unclaimed money as income, post a journal from account 2300 to 4350.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !rows.length ? <p className="text-sm text-muted-foreground">No deposits in this period.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Customer / bottles</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Taken</TableHead><TableHead>Claimed</TableHead><TableHead className="text-right">Days</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((r) => (
            <TableRow key={r.id}><TableCell>{r.who || "—"}</TableCell><TableCell className="text-right tabular">{r.currency} {r.amount.toFixed(2)}</TableCell><TableCell>{d(r.taken)}</TableCell>
              <TableCell>{r.claimed ? d(r.claimed) : <span className="font-medium text-destructive">Not claimed</span>}</TableCell><TableCell className="text-right tabular">{r.days}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      )}
    </section>
  );
}
