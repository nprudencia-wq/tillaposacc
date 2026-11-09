import { createFileRoute } from "@tanstack/react-router";
import { Fragment, Suspense, useEffect, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/pos";
import { harareDay } from "@/lib/cashier-dashboard";
import { buildSettlement, groupTotals, type MethodRow } from "@/lib/settlement";

export const Route = createFileRoute("/_authenticated/settlement")({
  validateSearch: (search: Record<string, unknown>): { day?: string } =>
    typeof search["day"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["day"]) ? { day: search["day"] } : {},
  head: () => ({ meta: [{ title: "Daily settlement — Tilla POS" }, { name: "description", content: "Settle the day's cash, card, mobile and account takings by payment type." }, { property: "og:title", content: "Daily settlement — Tilla POS" }, { property: "og:description", content: "Settle the day's takings by payment type with a reconciliation report." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettlementPage,
});

// The settlement table is newer than the generated types.
const db = supabase as unknown as { from: (t: string) => any };
const GROUP_LABEL = { cash: "Cash", other: "Card, bank & mobile money", account: "Account / credit sales" } as const;

function SettlementPage() {
  const { data: me } = useStaff();
  if (!me) return null;
  return <Suspense fallback={<p className="p-6 text-muted-foreground">Loading settlement…</p>}><Settlement storeId={me.storeId} /></Suspense>;
}

async function all<T>(q: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let o = 0; ; o += 500) {
    const { data, error } = await q().range(o, o + 499);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return out;
  }
}

function Settlement({ storeId }: { storeId: string }) {
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const day = Route.useSearch().day ?? harareDay().day;
  const start = new Date(`${day}T00:00:00+02:00`).toISOString();
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  const { data } = useSuspenseQuery({
    queryKey: ["settlement", storeId, day],
    queryFn: async () => {
      const [types, profiles, settings, saved] = await Promise.all([
        supabase.from("payment_types").select("code, name, is_cash, is_account").eq("store_id", storeId),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("settings").select("zig_rate, rand_rate").eq("store_id", storeId).maybeSingle(),
        db.from("daily_settlements").select("*").eq("store_id", storeId).eq("day", day).maybeSingle(),
      ]);
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
      const who = (id?: string | null) => (id && names.get(id)) || "Staff";
      const [sales, refunds, repayments, moves] = await Promise.all([
        all<any>(() => supabase.from("sales").select("id, sale_number, created_at, cashier_id, change_given, status, sale_payments(method, amount, exchange_rate)").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
        all<any>(() => supabase.from("refunds").select("id, created_at, refunded_by, method, amount").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
        all<any>(() => supabase.from("customer_payments").select("payment_number, created_at, received_by, method, amount").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
        all<any>(() => supabase.from("shift_cash_movements").select("id, created_at, user_id, type, currency, amount").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
      ]);
      const rate = (c: string) => (c === "ZiG" || c === "ZIG" ? Number(settings.data?.zig_rate) : c === "ZAR" ? Number(settings.data?.rand_rate) : 1) || 1;
      const rows = buildSettlement({
        types: types.data ?? [],
        sales: sales.map((s) => ({ ...s, cashier: who(s.cashier_id), payments: s.sale_payments ?? [] })),
        refunds: refunds.map((r) => ({ ...r, cashier: who(r.refunded_by) })),
        repayments: repayments.map((p) => ({ ...p, cashier: who(p.received_by) })),
        movements: moves.map((m) => ({ ...m, cashier: who(m.user_id), usd: Number(m.amount) / rate(m.currency) })),
      });
      return { rows, saved: saved.data as null | { lines: { method: string; counted: number }[]; notes: string; settled_at: string; settled_by: string }, settledBy: who(saved.data?.settled_by), saleCount: sales.length };
    },
  });

  const [counted, setCounted] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCounted(Object.fromEntries((data.saved?.lines ?? []).map((l) => [l.method, String(l.counted)])));
    setNotes(data.saved?.notes ?? "");
  }, [data.saved]);

  const totals = groupTotals(data.rows);
  const countOf = (r: MethodRow) => (counted[r.method] === undefined || counted[r.method] === "" ? null : Number(counted[r.method]));
  const settleRows = data.rows.filter((r) => r.group !== "account");

  async function save() {
    const bad = settleRows.find((r) => countOf(r) === null || !Number.isFinite(countOf(r)!) || countOf(r)! < 0);
    if (bad) return toast.error(`Enter the counted amount for ${bad.label}.`);
    setBusy(true);
    const lines = data.rows.map((r) => ({ method: r.method, label: r.label, group: r.group, expected: r.expected, counted: r.group === "account" ? r.expected : countOf(r), difference: r.group === "account" ? 0 : Math.round((countOf(r)! - r.expected) * 100) / 100 }));
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("daily_settlements").upsert({ store_id: storeId, day, lines, notes, settled_by: u.user?.id, settled_at: new Date().toISOString() }, { onConflict: "store_id,day" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Day settled");
    qc.invalidateQueries({ queryKey: ["settlement", storeId, day] });
  }

  return (
    <div className="space-y-6 p-4 md:p-6 print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Daily settlement</h1>
          <p className="text-sm text-muted-foreground">Sales by payment type for {day} (Harare time) · {data.saleCount} sales</p>
          {data.saved && <p className="mt-1 text-sm font-medium text-primary">Settled by {data.settledBy} at {new Date(data.saved.settled_at).toLocaleString()}</p>}
        </div>
        <div className="flex gap-2 print:hidden">
          <Input type="date" value={day} onChange={(e) => e.target.value && navigate({ search: { day: e.target.value } })} className="w-44" />
          <Button variant="outline" onClick={() => window.print()}>Print report</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["cash", "other", "account"] as const).map((g) => (
          <div key={g} className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{GROUP_LABEL[g]}</p>
            <p className="text-2xl font-bold">{money(totals[g])}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr><th className="p-3">Payment type</th><th className="p-3 text-right">Sales</th><th className="p-3 text-right">Repayments</th><th className="p-3 text-right">Refunds</th><th className="p-3 text-right">Drops / paid in-out</th><th className="p-3 text-right">Expected</th><th className="p-3 text-right">Counted</th><th className="p-3 text-right">Difference</th></tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No takings recorded for this day.</td></tr>}
            {data.rows.map((r) => {
              const c = r.group === "account" ? r.expected : countOf(r);
              const diff = c === null ? null : Math.round((c - r.expected) * 100) / 100;
              return (
                <Fragment key={r.method}>
                  <tr className="border-t">
                    <td className="p-3">
                      <button className="font-semibold underline-offset-2 hover:underline" onClick={() => setOpen(open === r.method ? null : r.method)}>{open === r.method ? "▾" : "▸"} {r.label}</button>
                      <div className="text-xs text-muted-foreground">{GROUP_LABEL[r.group]} · {r.sources.length} entries</div>
                    </td>
                    <td className="p-3 text-right">{money(r.sales)}</td>
                    <td className="p-3 text-right">{money(r.repayments)}</td>
                    <td className="p-3 text-right">{r.refunds ? `−${money(r.refunds)}` : money(0)}</td>
                    <td className="p-3 text-right">{money(r.movements)}</td>
                    <td className="p-3 text-right font-semibold">{money(r.expected)}</td>
                    <td className="p-3 text-right">
                      {r.group === "account" ? <span className="text-muted-foreground">On customer accounts</span> :
                        <Input inputMode="decimal" className="ml-auto w-28 text-right print:hidden" value={counted[r.method] ?? ""} onChange={(e) => setCounted({ ...counted, [r.method]: e.target.value })} placeholder="0.00" />}
                      {r.group !== "account" && <span className="hidden print:inline">{c === null ? "—" : money(c)}</span>}
                    </td>
                    <td className={`p-3 text-right font-semibold ${diff === null ? "" : diff < 0 ? "text-destructive" : diff > 0 ? "text-primary" : ""}`}>{diff === null ? "—" : diff > 0 ? `+${money(diff)}` : money(diff)}</td>
                  </tr>
                  {open === r.method && (
                    <tr className="bg-muted/30"><td colSpan={8} className="p-3">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground"><tr><th className="p-1 text-left">Time</th><th className="p-1 text-left">Source</th><th className="p-1 text-left">Reference</th><th className="p-1 text-left">Staff</th><th className="p-1 text-right">Amount (US$)</th></tr></thead>
                        <tbody>{r.sources.map((s, i) => (
                          <tr key={i} className="border-t border-border/50"><td className="p-1">{new Date(s.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit" })}</td><td className="p-1 capitalize">{s.kind.replace("_", " ")}</td><td className="p-1">{s.ref}</td><td className="p-1">{s.cashier}</td><td className="p-1 text-right">{money(s.usd)}</td></tr>
                        ))}</tbody>
                      </table>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">All amounts in US$. ZiG and Rand payments are converted at the rate saved on each sale; cash change given is taken off cash.</p>

      <div className="space-y-3 rounded-2xl border bg-card p-4 print:hidden">
        <label className="block text-sm font-semibold">Settlement notes<Textarea className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bank deposit slip, card batch number, shortages explained…" /></label>
        <Button size="lg" disabled={busy || data.rows.length === 0} onClick={save}>{data.saved ? "Update settlement" : "Settle day"}</Button>
      </div>
      {notes && <p className="hidden text-sm print:block">Notes: {notes}</p>}
    </div>
  );
}
