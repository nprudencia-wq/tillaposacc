import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const STEPS = [
  { key: "rate", title: "Set your exchange rate", text: "Enter today's ZiG (and Rand) rate so change is worked out correctly.", to: "/currencies" },
  { key: "sale", title: "Ring up your first sale", text: "Open the till and sell a starter item like Bread or Milk.", to: "/pos" },
  { key: "report", title: "View your report", text: "See today's takings and what sold in Reports.", to: "/reports" },
] as const;

/** 3-step welcome tour for new trial shop owners; progress is kept per user on this device. */
export function WelcomeTour({ userId, storeId, isOwner }: { userId: string; storeId: string; isOwner: boolean }) {
  const key = `tilla-tour:${storeId}:${userId}`;
  const [done, setDone] = useState<Record<string, boolean> | null>(null);
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(key) || "{}")); } catch { setDone({}); } }, [key]);
  const { data: trial } = useQuery({
    queryKey: ["tour-store", storeId],
    enabled: isOwner,
    queryFn: async () => {
      const [{ data: s }, { count }] = await Promise.all([
        supabase.from("stores").select("is_vendor_store").eq("id", storeId).maybeSingle(),
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      ]);
      return { isTrial: s ? !s.is_vendor_store : false, hasSale: (count ?? 0) > 0 };
    },
  });
  if (!isOwner || !done || !trial?.isTrial || done["dismissed"]) return null;
  const state: Record<string, boolean> = { ...done, sale: !!done["sale"] || trial.hasSale };
  const save = (next: Record<string, boolean>) => { setDone(next); localStorage.setItem(key, JSON.stringify(next)); };
  const finished = STEPS.every((s) => state[s.key]);

  return (
    <section className="mb-6 rounded-2xl border-2 border-primary/40 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{finished ? "You're all set!" : "Welcome to Tilla — 3 quick steps"}</h2>
          <p className="text-sm text-muted-foreground">{finished ? "Your shop is ready to trade." : "Get your shop trading in a few minutes."}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => save({ ...state, dismissed: true })}>{finished ? "Close" : "Skip tour"}</Button>
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`rounded-xl border p-4 ${state[s.key] ? "bg-muted/50" : ""}`}>
            <div className="flex items-center gap-2 font-semibold">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${state[s.key] ? "bg-primary text-primary-foreground" : "border"}`}>{state[s.key] ? <Check className="h-4 w-4" /> : i + 1}</span>
              {s.title}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            {!state[s.key] && <Button asChild size="sm" className="mt-3"><Link to={s.to} onClick={() => s.key !== "sale" && save({ ...state, [s.key]: true })}>Start</Link></Button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
