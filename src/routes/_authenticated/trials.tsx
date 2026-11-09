import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { listTrialLeads, type TrialLead } from "@/lib/trials.functions";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/trials")({
  head: () => ({ meta: [{ title: "Trial leads — Tilla POS" }, { name: "description", content: "Track shops that signed up for a Tilla POS free trial." }, { property: "og:title", content: "Trial leads — Tilla POS" }, { property: "og:description", content: "Sign-ups, trial days left and activity for each new shop." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <Suspense fallback={<p className="p-6 text-muted-foreground">Loading sign-ups…</p>}><Leads /></Suspense>,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error instanceof Error ? error.message : String(error)}</div>,
});

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

function Leads() {
  const { data } = useSuspenseQuery({ queryKey: ["trial-leads"], queryFn: () => listTrialLeads() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | TrialLead["status"]>("all");
  const rows = useMemo(() => data.filter((r) => (filter === "all" || r.status === filter) && `${r.shop} ${r.email} ${r.phone}`.toLowerCase().includes(q.toLowerCase())), [data, q, filter]);
  const count = (s: TrialLead["status"]) => data.filter((r) => r.status === s).length;
  const week = data.filter((r) => Date.now() - new Date(r.signedUp).getTime() < 7 * 86400000).length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Trial leads</h1>
        <p className="text-sm text-muted-foreground">Shops that signed up on tillapos.com, their trial clock and whether they are using the till.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Total sign-ups", data.length], ["This week", week], ["Active trials", count("active")], ["Expired", count("expired")]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-card p-4"><div className="text-sm text-muted-foreground">{l}</div><div className="text-2xl font-bold">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search shop, email or phone" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {(["all", "active", "expired", "paid"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-sm capitalize ${filter === f ? "bg-primary text-primary-foreground" : "bg-card"}`}>{f}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr><th className="p-3">Shop</th><th className="p-3">Contact</th><th className="p-3">Signed up</th><th className="p-3">Trial</th><th className="p-3 text-right">Products</th><th className="p-3 text-right">Sales</th><th className="p-3">Last sale</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No sign-ups yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-semibold">{r.shop}</td>
                <td className="p-3">{r.email && <a className="underline" href={`mailto:${r.email}`}>{r.email}</a>}<div className="text-muted-foreground">{r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>}</div></td>
                <td className="p-3">{day(r.signedUp)}</td>
                <td className="p-3">{r.status === "paid" ? <span className="font-semibold text-primary">Paying</span> : r.status === "expired" ? <span className="text-destructive">Expired {day(r.trialEnds)}</span> : `${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} left`}</td>
                <td className="p-3 text-right">{r.products}</td>
                <td className="p-3 text-right">{r.sales}</td>
                <td className="p-3">{day(r.lastSale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
