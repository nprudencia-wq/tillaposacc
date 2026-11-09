import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchShiftSummary, ShiftReportDialog, type ShiftSummary } from "@/components/Shift";
import { money } from "@/lib/pos";
import { ShiftHandoverDialog } from "@/components/ShiftHandover";
import { useStaff } from "@/hooks/use-staff";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { harareDay } from "@/lib/cashier-dashboard";

export const Route = createFileRoute("/_authenticated/shifts")({
  validateSearch: (search: Record<string, unknown>): { day?: string; cashier?: string } => {
    const result: { day?: string; cashier?: string } = {};
    const day = search["day"];
    if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00+02:00`))) result.day = day;
    if (typeof search["cashier"] === "string") result.cashier = search["cashier"];
    return result;
  },
  head: () => ({ meta: [{ title: "Shifts & cash-up — Tilla POS" }, { name: "description", content: "Cashier shifts, cash-ups and variances." }, { property: "og:title", content: "Shifts & cash-up — Tilla POS" }, { property: "og:description", content: "Cashier shifts, cash-ups and variances." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { data: me } = useStaff();
  if (!me) return null;
  return <Suspense fallback={<p className="p-6 text-muted-foreground">Loading shifts…</p>}><ShiftClosePage storeId={me.storeId} /></Suspense>;
}

function ShiftClosePage({ storeId }: { storeId: string }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const day = search.day ?? harareDay().day;
  const cashier = search.cashier ?? "all";
  const start = new Date(`${day}T00:00:00+02:00`).toISOString();
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  const [report, setReport] = useState<{ title: string; s: ShiftSummary } | null>(null);
  const [handover, setHandover] = useState<(typeof shifts)[number] | null>(null);
  const { data } = useSuspenseQuery({
    queryKey: ["shifts", "settlement", storeId, day],
    queryFn: async () => {
      const [shiftResult, profileResult] = await Promise.all([
        supabase.from("cashier_shifts").select("*").eq("store_id", storeId).lt("opened_at", end).or(`closed_at.gte.${start},status.eq.open`).order("opened_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (shiftResult.error) throw shiftResult.error;
      if (profileResult.error) throw profileResult.error;
      const sales: { cashier_id: string; total: number }[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from("sales").select("cashier_id, total").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id").range(offset, offset + 499);
        if (result.error) throw result.error;
        sales.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 500) break;
      }
      const names = new Map((profileResult.data ?? []).map((p) => [p.id, p.full_name]));
      return { shifts: (shiftResult.data ?? []).map((s) => ({ ...s, cashier: names.get(s.cashier_id) || "Staff" })), sales, names: [...names.entries()] };
    },
  });
  const shifts = data.shifts.filter((s) => cashier === "all" || s.cashier_id === cashier);
  const sales = data.sales.filter((s) => cashier === "all" || s.cashier_id === cashier);
  const closed = shifts.filter((s) => s.status === "closed");
  const cashiers = data.names.filter(([id]) => data.shifts.some((s) => s.cashier_id === id) || data.sales.some((s) => s.cashier_id === id));
  async function view(id: string, closed: boolean) {
    try { setReport({ title: closed ? "Z-report (shift closed)" : "X-report (mid-shift)", s: await fetchShiftSummary(id) }); }
    catch (e) { toast.error((e as Error).message); }
  }
  const v = (n: number | null, c: "USD" | "ZiG" | "ZAR") => {
    if (n == null) return "—";
    const x = Number(n);
    if (Math.abs(x) < 0.005) return <span className="text-success">Exact</span>;
    return <span className={x < 0 ? "text-destructive" : "text-warning"}>{x < 0 ? "Short " : "Over "}{money(Math.abs(x), c)}</span>;
  };
  return (
    <div className="p-4 lg:p-8">
      <header className="-mx-4 -mt-4 bg-sidebar p-5 text-sidebar-foreground lg:-mx-8 lg:-mt-8"><h1 className="font-display text-3xl font-bold">Shift close</h1><p className="mt-1 text-sm opacity-80">Daily sales & till settlement</p></header>
      <div className="my-5 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Day (Harare)<Input type="date" value={day} onChange={(e) => e.target.value && void navigate({ search: { ...search, day: e.target.value } })} className="mt-1 w-44" /></label><div className="w-56"><p className="mb-1 text-sm font-semibold">Cashier</p><Select value={cashier} onValueChange={(value) => void navigate({ search: { ...search, cashier: value } })}><SelectTrigger aria-label="Cashier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All cashiers</SelectItem>{cashiers.map(([id, name]) => <SelectItem key={id} value={id}>{name || "Staff"}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="grid gap-4 border-y py-5 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Daily sales · USD</p><p className="text-2xl font-bold">{money(sales.reduce((n, s) => n + Number(s.total), 0))}</p><p className="text-xs text-muted-foreground">{sales.length} uploaded sales</p></div><div><p className="text-sm text-muted-foreground">Shifts settled</p><p className="text-2xl font-bold">{closed.length}</p><p className="text-xs text-muted-foreground">{shifts.length - closed.length} still open</p></div><div><p className="text-sm text-muted-foreground">Cash counted · settled shifts</p><div className="space-y-1 text-sm font-semibold">{(["usd", "zig", "zar"] as const).map((c) => <div key={c}>{money(closed.reduce((n, s) => n + Number(s[`actual_cash_${c}`] ?? 0), 0), c === "usd" ? "USD" : c === "zig" ? "ZiG" : "ZAR")}</div>)}</div></div></div>
      <p className="mt-3 text-xs text-muted-foreground">Cash counts cover shifts settled on this day. Sales cover this calendar day. Offline records appear after upload; My day on each till also includes its unsent sales.</p>
      <div className="mt-6 overflow-x-auto border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr>
            <th className="p-3">Shift</th><th className="p-3">Cashier</th><th className="p-3">Opened</th><th className="p-3">Status</th>
            <th className="p-3">Cash counted</th><th className="p-3">USD variance</th><th className="p-3">ZiG variance</th><th className="p-3">Rand variance</th><th className="p-3"></th></tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-semibold">{s.shift_number}</td>
                <td className="p-3">{s.cashier}</td>
                <td className="p-3">{new Date(s.opened_at).toLocaleString()}</td>
                <td className="p-3">{s.status === "open" ? "Open" : "Closed"}</td>
                <td className="space-y-1 whitespace-nowrap p-3 font-mono text-xs">{s.status === "closed" ? <><div>{money(Number(s.actual_cash_usd ?? 0), "USD")}</div><div>{money(Number(s.actual_cash_zig ?? 0), "ZiG")}</div><div>{money(Number(s.actual_cash_zar ?? 0), "ZAR")}</div></> : "Not submitted"}</td>
                <td className="tabular p-3">{v(s.variance_usd, "USD")}</td>
                <td className="tabular p-3">{v(s.variance_zig, "ZiG")}</td><td className="tabular p-3">{v(s.variance_zar, "ZAR")}</td>
                <td className="flex gap-2 p-3"><Button size="sm" variant="outline" onClick={() => view(s.id, s.status === "closed")}>{s.status === "closed" ? "Z-report" : "X-report"}</Button>
                  <Button size="sm" variant={s.handover_summary ? "secondary" : "outline"} onClick={() => setHandover(s)}>{s.handover_summary ? "Handover ✓" : "Handover"}</Button></td>
              </tr>
            ))}
            {!shifts.length && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No shifts for this day.</td></tr>}
          </tbody>
        </table>
      </div>
      {handover && <ShiftHandoverDialog shift={handover} onClose={() => setHandover(null)} />}
      {report && <ShiftReportDialog title={report.title} s={report.s} onClose={() => setReport(null)} />}
    </div>
  );
}
