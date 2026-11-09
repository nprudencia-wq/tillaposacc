import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { money } from "@/lib/pos";
import { harareDay } from "@/lib/cashier-dashboard";
import { groupByTill, type TillSale, type TillShift } from "@/lib/multi-till";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/multi-till")({
  head: () => ({ meta: [{ title: "Multi-till overview — Tilla POS" }, { name: "description", content: "Compare each till's daily sales, payments and cash over/short." }, { property: "og:title", content: "Multi-till overview — Tilla POS" }, { property: "og:description", content: "Side-by-side daily totals for every till in the shop." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: MultiTillPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error instanceof Error ? error.message : String(error)}</div>,
});

function MultiTillPage() {
  const { data: me } = useStaff();
  const [day, setDay] = useState(() => harareDay().day);
  if (!me) return null;
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Multi-till overview</h1>
          <p className="text-sm text-muted-foreground">Each till's day, by the till name set when its shift opened. Uploaded sales only.</p>
        </div>
        <label className="text-sm font-medium">Day<Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="mt-1" /></label>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Loading tills…</p>}><Tills storeId={me.storeId} day={day} /></Suspense>
    </div>
  );
}

function Tills({ storeId, day }: { storeId: string; day: string }) {
  const { data } = useSuspenseQuery({
    queryKey: ["multi-till", storeId, day],
    queryFn: async () => {
      const { start, end } = harareDay(new Date(`${day}T12:00:00+02:00`));
      const db = supabase as unknown as { from: (t: string) => any };
      const [{ data: sales, error: e1 }, { data: shifts, error: e2 }, { data: types }] = await Promise.all([
        db.from("sales").select("shift_id,total,status,sale_payments(method,amount)").eq("store_id", storeId).gte("created_at", start).lt("created_at", end),
        db.from("cashier_shifts").select("id,device_name,cashier_id,status,opened_at,closed_at,variance_usd").eq("store_id", storeId).lt("opened_at", end).or(`closed_at.is.null,closed_at.gte.${start}`),
        db.from("payment_types").select("code,name").eq("store_id", storeId),
      ]);
      if (e1) throw e1; if (e2) throw e2;
      const ids = [...new Set((shifts ?? []).map((s: { cashier_id: string }) => s.cashier_id))];
      const { data: people } = ids.length ? await db.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
      const name = new Map((people ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
      const tShifts: TillShift[] = (shifts ?? []).map((s: any) => ({ ...s, cashier: name.get(s.cashier_id) ?? "Cashier" }));
      const tSales: TillSale[] = (sales ?? []).map((s: any) => ({ shift_id: s.shift_id, total: Number(s.total), status: s.status, payments: s.sale_payments ?? [] }));
      return { rows: groupByTill(tShifts, tSales), labels: Object.fromEntries((types ?? []).map((t: { code: string; name: string }) => [t.code, t.name])) as Record<string, string> };
    },
  });
  const { rows, labels } = data;
  const total = rows.reduce((a, r) => a + r.sales, 0);
  const count = rows.reduce((a, r) => a + r.count, 0);
  const active = rows.filter((r) => r.open).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Total sales", money(total)], ["Receipts", String(count)], ["Average sale", money(count ? total / count : 0)], ["Tills open now", `${active} of ${rows.length}`]].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="mt-1 font-display text-xl font-bold tabular">{v}</div></div>
        ))}
      </div>
      {rows.length === 0 && <p className="rounded-xl border bg-card p-6 text-muted-foreground">No till activity on this day.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.till} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{r.till}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.open ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{r.open ? "Shift open" : "Closed"}</span>
            </div>
            <p className="text-xs text-muted-foreground">{r.cashiers.join(", ") || "No shift"}{r.lastActive && ` · last active ${new Date(r.lastActive).toLocaleTimeString("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit" })}`}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-xs text-muted-foreground">Sales</div><div className="font-semibold tabular">{money(r.sales)}</div></div>
              <div><div className="text-xs text-muted-foreground">Receipts</div><div className="font-semibold tabular">{r.count}</div></div>
              <div><div className="text-xs text-muted-foreground">Average</div><div className="font-semibold tabular">{money(r.average)}</div></div>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              {Object.entries(r.methods).map(([m, v]) => <div key={m} className="flex justify-between"><span className="text-muted-foreground">{labels[m] ?? m}</span><span className="tabular">{money(v)}</span></div>)}
            </div>
            <div className="mt-3 flex justify-between border-t pt-2 text-sm">
              <span>Cash over/short (closed shifts)</span>
              <span className={`font-semibold tabular ${r.variance !== null && r.variance < 0 ? "text-destructive" : ""}`}>{r.variance === null ? "—" : `${r.variance > 0 ? "+" : ""}${money(r.variance)}`}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Amounts in US$. Shifts opened before this update show as "Unnamed till". Offline sales appear once they upload.</p>
    </>
  );
}
