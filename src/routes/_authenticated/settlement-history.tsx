import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, Suspense, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { money } from "@/lib/pos";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settlement-history")({
  head: () => ({ meta: [{ title: "Settlement history — Tilla POS" }, { name: "description", content: "Each settled day, the figures filled in, and who approved it." }, { property: "og:title", content: "Settlement history — Tilla POS" }, { property: "og:description", content: "Review auto-closed and manually settled days." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: HistoryPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error instanceof Error ? error.message : String(error)}</div>,
});

type Line = { method: string; label?: string; group?: string; expected?: number; counted?: number | null; difference?: number };
type Row = { id: string; day: string; lines: Line[]; notes: string; settled_at: string; settled_by: string; auto: boolean; approved_by: string | null; approved_at: string | null };

function HistoryPage() {
  const { data: me } = useStaff();
  if (!me) return null;
  return <Suspense fallback={<p className="p-6 text-muted-foreground">Loading history…</p>}><History storeId={me.storeId} /></Suspense>;
}

function History({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data: rows } = useSuspenseQuery({
    queryKey: ["settlement-history", storeId],
    queryFn: async () => {
      const db = supabase as unknown as { from: (t: string) => any };
      const [{ data: s, error }, { data: profiles }] = await Promise.all([
        db.from("daily_settlements").select("id, day, lines, notes, settled_at, settled_by, auto, approved_by, approved_at").eq("store_id", storeId).order("day", { ascending: false }).limit(90),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (error) throw error;
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      const who = (id?: string | null) => (id && names.get(id)) || "Staff";
      return (s ?? []).map((r: Row) => ({ ...r, settledByName: who(r.settled_by), approvedByName: r.approved_by ? who(r.approved_by) : null }));
    },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Settlement history</h1>
        <p className="text-sm text-muted-foreground">Each settled day, the figures that were filled in, and who approved it. Tap a day for the full breakdown.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr><th className="p-3">Day</th><th className="p-3 text-right">Expected</th><th className="p-3 text-right">Counted</th><th className="p-3 text-right">Over / short</th><th className="p-3">How settled</th><th className="p-3">Approved by</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No days settled yet. Days with sales settle themselves at midnight, or settle one from Daily settlement.</td></tr>}
            {rows.map((r) => {
              const lines = (r.lines ?? []).filter((l) => l.method !== "_owed");
              const owed = (r.lines ?? []).find((l) => l.method === "_owed");
              const exp = lines.reduce((t, l) => t + Number(l.expected ?? 0), 0);
              const cnt = lines.reduce((t, l) => t + Number(l.counted ?? l.expected ?? 0), 0);
              const diff = Math.round((cnt - exp) * 100) / 100;
              return (
                <Fragment key={r.id}>
                  <tr className="border-t">
                    <td className="p-3">
                      <button className="font-semibold underline-offset-2 hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "▾" : "▸"} {r.day}</button>
                    </td>
                    <td className="p-3 text-right">{money(exp)}</td>
                    <td className="p-3 text-right">{money(cnt)}</td>
                    <td className={`p-3 text-right font-semibold ${diff < 0 ? "text-destructive" : diff > 0 ? "text-primary" : ""}`}>{diff > 0 ? `+${money(diff)}` : money(diff)}</td>
                    <td className="p-3">
                      {r.auto ? <span className="font-medium text-warning">Auto-settled at midnight</span> : <span>Settled by {r.settledByName}</span>}
                      <div className="text-xs text-muted-foreground">{new Date(r.settled_at).toLocaleString("en-GB", { timeZone: "Africa/Harare" })}</div>
                    </td>
                    <td className="p-3">
                      {r.auto
                        ? r.approvedByName
                          ? <span>{r.approvedByName}<div className="text-xs text-muted-foreground">{r.approved_at ? new Date(r.approved_at).toLocaleString("en-GB", { timeZone: "Africa/Harare" }) : ""}</div></span>
                          : <span className="text-muted-foreground">Not approved yet</span>
                        : <span className="text-muted-foreground">Settled manually</span>}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr className="bg-muted/30"><td colSpan={6} className="p-3">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground"><tr><th className="p-1 text-left">Payment type</th><th className="p-1 text-right">Expected</th><th className="p-1 text-right">Counted</th><th className="p-1 text-right">Difference</th></tr></thead>
                        <tbody>
                          {lines.map((l) => (
                            <tr key={l.method} className="border-t border-border/50">
                              <td className="p-1">{l.label ?? l.method}</td>
                              <td className="p-1 text-right">{money(Number(l.expected ?? 0))}</td>
                              <td className="p-1 text-right">{l.counted === null || l.counted === undefined ? "—" : money(Number(l.counted))}</td>
                              <td className="p-1 text-right">{money(Number(l.difference ?? 0))}</td>
                            </tr>
                          ))}
                          {owed && <tr className="border-t border-border/50"><td className="p-1 font-medium">Total owed by customers at close</td><td className="p-1 text-right font-medium" colSpan={3}>{money(Number(owed.expected ?? 0))}</td></tr>}
                        </tbody>
                      </table>
                      {r.notes && <p className="mt-2 text-xs text-muted-foreground">Notes: {r.notes}</p>}
                      <Button asChild variant="outline" size="sm" className="mt-2"><Link to="/settlement" search={{ day: r.day }}>Open day</Link></Button>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">All amounts in US$. Auto-settled days wait for a manager's approval on the Daily settlement page.</p>
    </div>
  );
}
