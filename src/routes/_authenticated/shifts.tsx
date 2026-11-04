import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchShiftSummary, ShiftReportDialog, type ShiftSummary } from "@/components/Shift";
import { money } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({ meta: [{ title: "Shifts & cash-up — Tilla POS" }, { name: "description", content: "Cashier shifts, cash-ups and variances." }] }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const [report, setReport] = useState<{ title: string; s: ShiftSummary } | null>(null);
  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const [{ data }, { data: profiles }] = await Promise.all([
        supabase.from("cashier_shifts").select("*").order("opened_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id, full_name"),
      ]);
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (data ?? []).map((s) => ({ ...s, cashier: names.get(s.cashier_id) || "Staff" }));
    },
  });
  async function view(id: string, closed: boolean) {
    try { setReport({ title: closed ? "Z-report (shift closed)" : "X-report (mid-shift)", s: await fetchShiftSummary(id) }); }
    catch (e) { toast.error((e as Error).message); }
  }
  const v = (n: number | null, c: "USD" | "ZiG") => {
    if (n == null) return "—";
    const x = Number(n);
    if (Math.abs(x) < 0.005) return <span className="text-success">Exact</span>;
    return <span className={x < 0 ? "text-destructive" : "text-warning"}>{x < 0 ? "Short " : "Over "}{money(Math.abs(x), c)}</span>;
  };
  return (
    <div className="p-4 lg:p-8">
      <h1 className="font-display text-3xl font-bold">Shifts and cash-ups</h1>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr>
            <th className="p-3">Shift</th><th className="p-3">Cashier</th><th className="p-3">Opened</th><th className="p-3">Status</th>
            <th className="p-3">USD variance</th><th className="p-3">ZiG variance</th><th className="p-3"></th></tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-semibold">{s.shift_number}</td>
                <td className="p-3">{s.cashier}</td>
                <td className="p-3">{new Date(s.opened_at).toLocaleString()}</td>
                <td className="p-3">{s.status === "open" ? "Open" : "Closed"}</td>
                <td className="tabular p-3">{v(s.variance_usd, "USD")}</td>
                <td className="tabular p-3">{v(s.variance_zig, "ZiG")}</td>
                <td className="p-3"><Button size="sm" variant="outline" onClick={() => view(s.id, s.status === "closed")}>{s.status === "closed" ? "Z-report" : "X-report"}</Button></td>
              </tr>
            ))}
            {!shifts.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No shifts yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {report && <ShiftReportDialog title={report.title} s={report.s} onClose={() => setReport(null)} />}
    </div>
  );
}
