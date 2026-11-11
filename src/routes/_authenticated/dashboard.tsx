import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { money, type Currency, type PayMethod } from "@/lib/pos";
import { methodLabel } from "@/lib/payment-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptActions, type ReceiptData } from "@/components/Receipt";
import { WelcomeTour } from "@/components/WelcomeTour";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Tilla POS" }, { name: "description", content: "Sales and stock at a glance." }, { property: "og:title", content: "Dashboard — Tilla POS" }, { property: "og:description", content: "Sales and stock at a glance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

type Period = "today" | "yesterday" | "7d" | "month" | "custom";
const periodLabels: Record<Period, string> = { today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", month: "This month", custom: "Pick dates" };
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function range(p: Period, custom: { from: string; to: string }) {
  if (p === "custom") return { start: new Date(custom.from + "T00:00:00").toISOString(), end: new Date(custom.to + "T23:59:59.999").toISOString() };
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date();
  if (p === "yesterday") { start.setDate(start.getDate() - 1); end.setTime(start.getTime()); end.setHours(23, 59, 59, 999); }
  if (p === "7d") start.setDate(start.getDate() - 6);
  if (p === "month") start.setDate(1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function Dashboard() {
  const { data: me } = useStaff();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [rate, setRate] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [custom, setCustom] = useState(() => ({ from: isoDay(new Date()), to: isoDay(new Date()) }));
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const { data } = useQuery({
    queryKey: ["sales", "dashboard"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 6); since.setHours(0, 0, 0, 0);
      const [{ data: sales }, { data: items }, { data: low }] = await Promise.all([
        supabase.from("sales").select("id, total, created_at").gte("created_at", since.toISOString()),
        supabase.from("sale_items").select("name, quantity, line_total, cost_price, sales!inner(created_at)").gte("sales.created_at", since.toISOString()),
        supabase.from("products").select("id, name, stock, min_stock").eq("active", true),
      ]);
      return { sales: sales ?? [], items: items ?? [], low: (low ?? []).filter((p) => Number(p.stock) <= Number(p.min_stock)) };
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["sales", "dashboard-summary", period, period === "custom" ? custom : null],
    enabled: period !== "custom" || (!!custom.from && !!custom.to && custom.from <= custom.to),
    queryFn: async () => {
      const { start, end } = range(period, custom);
      const [{ data: sales }, { data: pays }, { data: refunds }, { data: profiles }, { data: pItems }] = await Promise.all([
        supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }),
        supabase.from("sale_payments").select("sale_id, method, currency, amount, exchange_rate, sales!inner(created_at, exchange_rate)").gte("sales.created_at", start).lte("sales.created_at", end),
        supabase.from("refunds").select("amount, created_at").gte("created_at", start).lte("created_at", end),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("sale_items").select("quantity, refunded_qty, cost_price, sales!inner(created_at)").gte("sales.created_at", start).lte("sales.created_at", end),
      ]);
      return { cogs: (pItems ?? []).reduce((a, i) => a + Number(i.cost_price) * (Number(i.quantity) - Number(i.refunded_qty ?? 0)), 0), sales: sales ?? [], pays: pays ?? [], refunds: refunds ?? [], names: Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name])) as Record<string, string> };
    },
  });

  const pSales = summary?.sales ?? [];
  const pGross = pSales.reduce((a, s) => a + Number(s.subtotal), 0);
  const pDisc = pSales.reduce((a, s) => a + Number(s.discount), 0);
  const pTotal = pSales.reduce((a, s) => a + Number(s.total), 0);
  const pRefunds = (summary?.refunds ?? []).reduce((a, r) => a + Number((r as { amount: number }).amount ?? 0), 0);
  const avg = pSales.length ? pTotal / pSales.length : 0;

  const byMethod = Object.values((summary?.pays ?? []).reduce<Record<string, { key: string; label: string; usd: number; count: Set<string> }>>((acc, p) => {
    const key = `${p.method}-${p.currency}`;
    const rateUsed = Number(p.exchange_rate) || 1;
    const usd = Number(p.amount) / rateUsed;
    const e = (acc[key] ??= { key, label: `${methodLabel(p.method)} (${p.currency})`, usd: 0, count: new Set() });
    e.usd += usd; e.count.add(p.sale_id);
    return acc;
  }, {})).sort((a, b) => b.usd - a.usd);
  const payTotal = byMethod.reduce((a, m) => a + m.usd, 0);

  async function openReceipt(s: (typeof pSales)[number]) {
    const [{ data: items }, { data: pays }] = await Promise.all([
      supabase.from("sale_items").select("*").eq("sale_id", s.id),
      supabase.from("sale_payments").select("*").eq("sale_id", s.id),
    ]);
    setReceipt({
      sale_number: s.sale_number, created_at: s.created_at, business: settings?.business_name ?? "",
      cashier: summary?.names[s.cashier_id] ?? "", currency: s.currency as Currency, rate: Number(s.exchange_rate),
      items: (items ?? []).map((i) => ({ name: i.name, quantity: Number(i.quantity), unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
      subtotal: Number(s.subtotal), discount: Number(s.discount), total: Number(s.total), change: Number(s.change_given),
      payments: (pays ?? []).map((p) => ({ method: p.method as PayMethod, currency: p.currency as Currency, amount: Number(p.amount) })),
    });
  }

  const today = new Date().toDateString();
  const todaySales = (data?.sales ?? []).filter((s) => new Date(s.created_at).toDateString() === today);
  const todayTotal = todaySales.reduce((s, x) => s + Number(x.total), 0);
  const weekTotal = (data?.sales ?? []).reduce((s, x) => s + Number(x.total), 0);
  const cogs = (data?.items ?? []).reduce((s, i) => s + Number(i.cost_price) * Number(i.quantity), 0);
  const revenue = (data?.items ?? []).reduce((s, i) => s + Number(i.line_total), 0);

  const days = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - k));
    const key = d.toDateString();
    return { day: d.toLocaleDateString(undefined, { weekday: "short" }), total: Math.round((data?.sales ?? []).filter((s) => new Date(s.created_at).toDateString() === key).reduce((a, s) => a + Number(s.total), 0) * 100) / 100 };
  });

  const top = Object.values((data?.items ?? []).reduce<Record<string, { name: string; qty: number; total: number }>>((acc, i) => {
    const e = (acc[i.name] ??= { name: i.name, qty: 0, total: 0 });
    e.qty += Number(i.quantity); e.total += Number(i.line_total);
    return acc;
  }, {})).sort((a, b) => b.total - a.total).slice(0, 5);

  async function saveRate() {
    const v = Number(rate);
    if (!v || v <= 0) { toast.error("Enter a valid rate"); return; }
    const { error } = await supabase.from("settings").update({ zig_rate: v, updated_at: new Date().toISOString() }).eq("store_id", me?.storeId ?? "");
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["settings"] }); setRate("");
    toast.success("Exchange rate updated");
  }

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      {me && <WelcomeTour userId={me.id} storeId={me.storeId} isOwner={me.isOwner} />}
      <h1 className="text-3xl font-bold">Sales and stock dashboard</h1>
      <p className="text-muted-foreground">Good day{me ? `, ${me.name.split(" ")[0]}` : ""} · {settings?.business_name} · ZiG {settings?.zig_rate} = $1</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Today's sales" value={money(todayTotal)} sub={`${todaySales.length} transactions`} />
        <Card label="Last 7 days" value={money(weekTotal)} sub={`${data?.sales.length ?? 0} transactions`} />
        <Card label="Gross profit (7 days)" value={money(revenue - cogs)} sub={revenue ? `${Math.round(((revenue - cogs) / revenue) * 100)}% margin` : "—"} />
        <Card label="Low-stock items" value={String(data?.low.length ?? 0)} sub="at or below minimum" warn={!!data?.low.length} />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Sales summary</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1" role="group" aria-label="Summary period">
              {(Object.keys(periodLabels) as Period[]).map((p) => (
                <Button key={p} size="sm" variant={period === p ? "default" : "ghost"} onClick={() => setPeriod(p)}>{periodLabels[p]}</Button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex items-center gap-1">
                <Input type="date" aria-label="From date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 w-40 bg-card" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="date" aria-label="To date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 w-40 bg-card" />
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card label="Net sales" value={money(pTotal)} sub={`ZiG ${(pTotal * Number(settings?.zig_rate ?? 0)).toFixed(2)}`} />
          <Card label="Receipts" value={String(pSales.length)} sub="completed sales" />
          <Card label="Average sale" value={money(avg)} sub="per receipt" />
          <Card label="Discounts" value={money(pDisc)} sub={`from ${money(pGross)} gross`} />
          <Card label="Refunds" value={money(pRefunds)} sub={`${summary?.refunds.length ?? 0} refunds`} />
        </div>

        <div className="mt-6 rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-semibold">Sales summary · {periodLabels[period]}</h3>
          <div className="grid gap-x-10 text-sm md:grid-cols-2">
            {([
              ["Gross sales", pGross, false],
              ["Refunds", -pRefunds, false],
              ["Discounts", -pDisc, false],
              ["Net sales", pTotal - pRefunds, true],
              ["Cost of goods", -(summary?.cogs ?? 0), false],
              ["Gross profit", pTotal - pRefunds - (summary?.cogs ?? 0), true],
            ] as const).map(([l, v, b]) => (
              <div key={l} className={`flex justify-between border-b py-2 ${b ? "font-semibold" : ""}`}><span>{l}</span><span className={`tabular ${v < 0 ? "text-destructive" : ""}`}>{money(v)}</span></div>
            ))}
            <div className="flex justify-between border-b py-2"><span>Gross margin</span><span className="tabular">{pTotal - pRefunds > 0 ? `${(((pTotal - pRefunds - (summary?.cogs ?? 0)) / (pTotal - pRefunds)) * 100).toFixed(1)}%` : "—"}</span></div>
            <div className="flex justify-between border-b py-2"><span>Receipts · average</span><span className="tabular">{pSales.length} · {money(avg)}</span></div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border bg-card p-5 shadow-soft">
            <h3 className="mb-3 font-semibold">Sales by payment type</h3>
            {!byMethod.length && <p className="text-sm text-muted-foreground">No payments in this period.</p>}
            {byMethod.map((m) => {
              const pct = payTotal ? (m.usd / payTotal) * 100 : 0;
              return (
                <div key={m.key} className="py-2 text-sm">
                  <div className="flex justify-between"><span>{m.label} <span className="text-muted-foreground">· {m.count.size}</span></span><span className="tabular">{money(m.usd)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  <div className="text-xs text-muted-foreground">{pct.toFixed(0)}% of takings</div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-soft lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Receipts</h3>
              <Link to="/sales" className="text-sm font-medium text-primary">All sales →</Link>
            </div>
            {!pSales.length && <p className="text-sm text-muted-foreground">No receipts in this period.</p>}
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                {pSales.length > 0 && <thead className="text-left text-muted-foreground"><tr><th className="py-1 font-medium">Receipt</th><th className="font-medium">Time</th><th className="font-medium">Cashier</th><th className="text-right font-medium">Total</th><th /></tr></thead>}
                <tbody>
                  {pSales.slice(0, 50).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-2 font-mono">{s.sale_number}</td>
                      <td>{new Date(s.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="truncate">{summary?.names[s.cashier_id] ?? ""}</td>
                      <td className="tabular text-right">{money(Number(s.total))}</td>
                      <td className="text-right"><Button size="sm" variant="ghost" onClick={() => openReceipt(s)} aria-label={`View receipt ${s.sale_number}`}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receipt {receipt?.sale_number}</DialogTitle></DialogHeader>
          {receipt && <ReceiptActions r={receipt} />}
        </DialogContent>
      </Dialog>


      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-soft lg:col-span-2">
          <h2 className="mb-4 font-semibold">Sales this week (USD)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">Top sellers</h2>
            {!top.length && <p className="text-sm text-muted-foreground">No sales yet.</p>}
            {top.map((t) => (
              <div key={t.name} className="flex justify-between py-1.5 text-sm"><span className="truncate">{t.name} <span className="text-muted-foreground">×{t.qty}</span></span><span className="tabular">{money(t.total)}</span></div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">Running low</h2>
            {(data?.low ?? []).slice(0, 6).map((p) => (
              <div key={p.id} className="flex justify-between py-1 text-sm"><span>{p.name}</span><span className="tabular text-destructive">{Number(p.stock)}</span></div>
            ))}
            {!data?.low.length && <p className="text-sm text-muted-foreground">All stock is healthy.</p>}
            <Link to="/inventory" className="mt-2 inline-block text-sm font-medium text-primary">Open inventory →</Link>
          </div>
          {me?.canManageStock && (
            <div className="rounded-xl border bg-card p-5 shadow-soft">
              <h2 className="mb-3 font-semibold">ZiG exchange rate</h2>
              <div className="flex gap-2">
                <Input type="number" step="0.01" placeholder={String(settings?.zig_rate ?? "")} value={rate} onChange={(e) => setRate(e.target.value)} />
                <Button onClick={saveRate}>Save</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-soft ${warn ? "border-warning" : ""}`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
