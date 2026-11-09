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
import { cached, deviceSales, isNetworkError } from "@/lib/offline";
import { readRepayments, creditSnapshot, owedNow } from "@/lib/offline-credit";
import { useQuery } from "@tanstack/react-query";
import { isAccountMethod } from "@/lib/payment-types";
import { queueSettlement, readPendingSettlements, uploadSettlement } from "@/lib/settlement-queue";
import { internetAvailable } from "@/lib/connectivity";

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
      const server = await cached(`settlement:${storeId}:${day}`, () => loadServer());
      // Add this device's sales and debt payments that haven't uploaded yet, so the day can be settled offline.
      const saleRefs = new Set(server.saleRefs); const payRefs = new Set(server.payRefs);
      const inDay = (at: string) => at >= start && at < end;
      const local = (await deviceSales()).filter((s) => s.store_id === storeId && inDay(s.sold_at) && !saleRefs.has(s.client_ref));
      const reps = (await readRepayments()).filter((r) => inDay(r.paid_at) && !payRefs.has(r.client_ref));
      const me = server.me;
      const rows = buildSettlement({
        types: server.types,
        sales: [...server.sales, ...local.map((s) => ({ id: s.client_ref, sale_number: s.receipt?.sale_number ?? s.client_ref, created_at: s.sold_at, cashier: `${s.receipt?.cashier || me} (on this till)`, change_given: Number(s.receipt?.change ?? 0), payments: s.payments.map((p) => ({ method: p.method, amount: p.amount, exchange_rate: p.exchange_rate ?? 1 })) }))],
        refunds: server.refunds,
        repayments: [...server.repayments, ...reps.map((r) => ({ payment_number: `${r.customer_name} (on this till)`, created_at: r.paid_at, cashier: me, method: r.method, amount: r.usd }))],
        movements: server.movements,
      });
      const pending = (await readPendingSettlements()).find((p) => p.store_id === storeId && p.day === day);
      const saved = pending ? (pending as unknown as NonNullable<typeof server.saved>) : server.saved;
      return { rows, saved, shiftCash: server.shiftCash, shiftCount: server.shiftCount, settledBy: pending ? `${me} (waiting to upload)` : server.settledBy, saleCount: server.sales.length + local.length, localCount: local.length + reps.length, checkedAt: server.checkedAt };
    },
    // Keep the day's figures up to date while the page is open.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  async function loadServer() {
      const [types, profiles, settings, saved] = await Promise.all([
        supabase.from("payment_types").select("code, name, is_cash, is_account").eq("store_id", storeId),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("settings").select("zig_rate, rand_rate").eq("store_id", storeId).maybeSingle(),
        db.from("daily_settlements").select("*").eq("store_id", storeId).eq("day", day).maybeSingle(),
      ]);
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
      const who = (id?: string | null) => (id && names.get(id)) || "Staff";
      const [sales, refunds, repayments, moves, shifts] = await Promise.all([
        all<any>(() => supabase.from("sales").select("id, sale_number, created_at, cashier_id, change_given, status, client_ref, sale_payments(method, amount, exchange_rate)").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
        all<any>(() => supabase.from("refunds").select("id, created_at, refunded_by, method, amount").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
        all<any>(() => supabase.from("customer_payments").select("payment_number, created_at, received_by, method, amount, client_ref").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
        all<any>(() => supabase.from("shift_cash_movements").select("id, created_at, user_id, type, currency, amount, reason").eq("store_id", storeId).gte("created_at", start).lt("created_at", end).order("id")),
        all<any>(() => supabase.from("cashier_shifts").select("id, opening_float_usd, opening_float_zig, opening_float_zar, actual_cash_usd, actual_cash_zig, actual_cash_zar").eq("store_id", storeId).eq("status", "closed").gte("closed_at", start).lt("closed_at", end).order("id")),
      ]);
      const rate = (c: string) => (c === "ZiG" || c === "ZIG" ? Number(settings.data?.zig_rate) : c === "ZAR" ? Number(settings.data?.rand_rate) : 1) || 1;
      const { data: auth } = await supabase.auth.getSession();
      return {
        types: types.data ?? [],
        sales: sales.map((s) => ({ ...s, cashier: who(s.cashier_id), payments: s.sale_payments ?? [] })),
        refunds: refunds.map((r) => ({ ...r, cashier: who(r.refunded_by) })),
        repayments: repayments.map((p) => ({ ...p, cashier: who(p.received_by) })),
        movements: moves.map((m) => ({ ...m, cashier: who(m.user_id), usd: Number(m.amount) / rate(m.currency) })),
        saleRefs: sales.map((s) => s.client_ref).filter(Boolean) as string[],
        payRefs: repayments.map((p) => p.client_ref).filter(Boolean) as string[],
        // Cash the cashiers counted at shift close, minus their floats, in US$.
        shiftCash: shifts.length ? Math.round(shifts.reduce((t, s) => t
          + (Number(s.actual_cash_usd ?? 0) - Number(s.opening_float_usd ?? 0))
          + (Number(s.actual_cash_zig ?? 0) - Number(s.opening_float_zig ?? 0)) / rate("ZiG")
          + (Number(s.actual_cash_zar ?? 0) - Number(s.opening_float_zar ?? 0)) / rate("ZAR"), 0) * 100) / 100 : null,
        shiftCount: shifts.length,
        saved: saved.data as null | { lines: { method: string; counted: number }[]; notes: string; settled_at: string; settled_by: string; auto?: boolean },
        settledBy: who(saved.data?.settled_by), me: who(auth.session?.user.id), checkedAt: new Date().toISOString(),
      };
  }

  const [counted, setCounted] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  const autoCounts = () => {
    const cashRows = data.rows.filter((r) => r.group === "cash");
    return Object.fromEntries(data.rows.filter((r) => r.group !== "account").map((r) => [r.method,
      r.group === "cash" && cashRows.length === 1 && data.shiftCash !== null ? String(data.shiftCash) : String(r.expected)]));
  };
  const signature = data.rows.map((r) => `${r.method}:${r.expected}`).join("|");
  useEffect(() => {
    const manual = data.saved && !data.saved.auto && data.saved.lines.length > 0;
    if (edited && !manual) return; // don't overwrite what the manager is typing
    if (data.saved && data.saved.lines.length > 0 && manual) setCounted(Object.fromEntries(data.saved!.lines.map((l) => [l.method, String(l.counted)])));
    else {
      // Filled in automatically: cash from the shift close counts, card/mobile at what the till recorded.
      const cashRows = data.rows.filter((r) => r.group === "cash");
      setCounted(Object.fromEntries(data.rows.filter((r) => r.group !== "account").map((r) => [r.method,
        r.group === "cash" && cashRows.length === 1 && data.shiftCash !== null ? String(data.shiftCash) : String(r.expected)])));
    }
    setNotes(data.saved?.notes ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.saved, signature, data.shiftCash]);
  const savedOwed = (data.saved?.lines as { method: string; expected?: number }[] | undefined)?.find((l) => l.method === "_owed");
  const liveOwed = useQuery({
    queryKey: ["settlement-owed", storeId],
    enabled: !savedOwed,
    queryFn: async () => {
      const [snap, sales, reps] = await Promise.all([creditSnapshot().catch(() => undefined), deviceSales(), readRepayments()]);
      const ids = new Set<string>([...Object.keys(snap?.balances ?? {}), ...sales.map((x) => x.customer_id).filter(Boolean) as string[], ...reps.map((r) => r.customer_id)]);
      let t = 0; for (const id of ids) t += Math.max(0, owedNow(id, snap, sales, reps, isAccountMethod));
      return Math.round(t * 100) / 100;
    },
  });
  const owedTotal = savedOwed ? Number(savedOwed.expected ?? 0) : liveOwed.data;
  const autoFilled = !(data.saved && !data.saved.auto && data.saved.lines.length > 0);

  const totals = groupTotals(data.rows);
  const countOf = (r: MethodRow) => (counted[r.method] === undefined || counted[r.method] === "" ? null : Number(counted[r.method]));
  const settleRows = data.rows.filter((r) => r.group !== "account");

  async function save(override?: Record<string, string>, noteOverride?: string) {
    const notesToSave = noteOverride ?? notes;
    const src = override ?? counted;
    const countOf = (r: MethodRow) => (src[r.method] === undefined || src[r.method] === "" ? null : Number(src[r.method]));
    const bad = settleRows.find((r) => countOf(r) === null || !Number.isFinite(countOf(r)!) || countOf(r)! < 0);
    if (bad) { toast.error(`Enter the counted amount for ${bad.label}.`); return; }
    setBusy(true);
    const lines = data.rows.map((r) => ({ method: r.method, label: r.label, group: r.group, expected: r.expected, counted: r.group === "account" ? r.expected : countOf(r), difference: r.group === "account" ? 0 : Math.round((countOf(r)! - r.expected) * 100) / 100 }));
    const owedLine = (data.saved?.lines as { method: string }[] | undefined)?.find((l) => l.method === "_owed");
    if (owedLine) (lines as unknown[]).push(owedLine);
    else if (owedTotal !== undefined) (lines as unknown[]).push({ method: "_owed", label: "Total owed by customers", group: "owed", expected: owedTotal, counted: owedTotal, difference: 0 });
    const { data: u } = await supabase.auth.getSession();
    const approving = !!data.saved?.auto;
    const record = { store_id: storeId, day, lines, notes: notesToSave, settled_by: u.session?.user.id ?? "", settled_at: new Date().toISOString(), auto: false,
      ...(approving ? { approved_by: u.session?.user.id ?? null, approved_at: new Date().toISOString() } : {}) };
    let offline = !internetAvailable();
    if (!offline) {
      const { error } = await uploadSettlement(record).catch((e) => ({ error: e as { message: string } }));
      if (error && !isNetworkError(error)) { setBusy(false); toast.error(error.message); return; }
      offline = !!error;
    }
    if (offline) await queueSettlement(record);
    setBusy(false);
    toast.success(offline ? "Day settled on this device — it uploads when the internet is back" : "Day settled");
    setEdited(false);
    qc.invalidateQueries({ queryKey: ["settlement", storeId, day] });
  }
  async function settleAuto() {
    const auto = autoCounts();
    setCounted(auto);
    const note = notes || `Settled automatically from till figures${data.shiftCount ? ` and ${data.shiftCount} shift close count(s)` : ""}.`;
    setNotes(note);
    await save(auto, note);
  }

  return (
    <div className="space-y-6 p-4 md:p-6 print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Daily settlement</h1>
          <p className="text-sm text-muted-foreground">Sales by payment type for {day} (Harare time) · {data.saleCount} sales</p>
          {data.localCount > 0 && <p className="mt-1 text-sm text-warning">Includes {data.localCount} sale(s)/payment(s) still waiting to upload from this till.</p>}
          {data.saved?.auto && <p className="mt-1 text-sm font-medium text-warning">Auto-settled at midnight — check the counts below and tap Approve settlement.</p>}
          {autoFilled && data.rows.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Counts filled in automatically{data.shiftCount ? ` from ${data.shiftCount} closed shift(s)` : ""}; change any that differ.</p>}
          {data.saved && !data.saved.auto && <p className="mt-1 text-sm font-medium text-primary">Settled by {data.settledBy} at {new Date(data.saved.settled_at).toLocaleString()}</p>}
        </div>
        <div className="flex gap-2 print:hidden">
          <Input type="date" value={day} onChange={(e) => e.target.value && navigate({ search: { day: e.target.value } })} className="w-44" />
          <Button onClick={settleAuto} disabled={busy || data.rows.length === 0}>Settle day automatically</Button>
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
                        <Input inputMode="decimal" className="ml-auto w-28 text-right print:hidden" value={counted[r.method] ?? ""} onChange={(e) => { setEdited(true); setCounted({ ...counted, [r.method]: e.target.value }); }} placeholder="0.00" />}
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
            {owedTotal !== undefined && (
              <tr className="border-t-2 bg-muted/30">
                <td className="p-3"><div className="font-semibold">Total owed by customers</div><div className="text-xs text-muted-foreground">{savedOwed ? "All customer balances at close" : "All customer balances right now"}</div></td>
                <td colSpan={4} className="p-3 text-xs text-muted-foreground">Includes this day's credit sales{totals.account ? ` (${money(totals.account)})` : ""} and earlier unpaid debt, less repayments.</td>
                <td className="p-3 text-right font-semibold">{money(owedTotal)}</td>
                <td className="p-3 text-right text-muted-foreground">On accounts</td>
                <td className="p-3 text-right">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">All amounts in US$. ZiG and Rand payments are converted at the rate saved on each sale; cash change given is taken off cash.</p>

      <div className="space-y-3 rounded-2xl border bg-card p-4 print:hidden">
        <label className="block text-sm font-semibold">Settlement notes<Textarea className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bank deposit slip, card batch number, shortages explained…" /></label>
        <Button size="lg" disabled={busy || data.rows.length === 0} onClick={() => save()}>{data.saved?.auto ? "Approve settlement" : data.saved ? "Update settlement" : "Settle day"}</Button>
      </div>
      {notes && <p className="hidden text-sm print:block">Notes: {notes}</p>}
    </div>
  );
}
