import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Tilla POS" }, { name: "description", content: "Sales and stock at a glance." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useStaff();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [rate, setRate] = useState("");

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
    const { error } = await supabase.from("settings").update({ zig_rate: v, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["settings"] }); setRate("");
    toast.success("Exchange rate updated");
  }

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Good day{me ? `, ${me.name.split(" ")[0]}` : ""}</h1>
      <p className="text-muted-foreground">{settings?.business_name} · ZiG {settings?.zig_rate} = $1</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Today's sales" value={money(todayTotal)} sub={`${todaySales.length} transactions`} />
        <Card label="Last 7 days" value={money(weekTotal)} sub={`${data?.sales.length ?? 0} transactions`} />
        <Card label="Gross profit (7 days)" value={money(revenue - cogs)} sub={revenue ? `${Math.round(((revenue - cogs) / revenue) * 100)}% margin` : "—"} />
        <Card label="Low-stock items" value={String(data?.low.length ?? 0)} sub="at or below minimum" warn={!!data?.low.length} />
      </div>

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
