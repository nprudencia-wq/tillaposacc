import { Suspense, useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CloudOff, Package, ReceiptText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cached, deviceSales, readQueue, type QueuedSale } from "@/lib/offline";
import { harareDay, cashierDailyTotals } from "@/lib/cashier-dashboard";
import { money } from "@/lib/pos";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; cashier: { id: string; storeId: string; name: string }; products: { id: string; name: string; stock: number | string; min_stock: number | string }[] };

export function CashierDashboard(props: Props) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto p-0">
      <DialogHeader className="flex-row items-center justify-between space-y-0 bg-sidebar p-5 pr-12 text-sidebar-foreground"><DialogTitle>My day</DialogTitle><Button size="sm" variant="secondary" onClick={() => props.onOpenChange(false)}><X className="mr-1 h-4 w-4" />Exit</Button></DialogHeader>
      <Suspense fallback={<p className="p-6 text-muted-foreground">Loading today’s sales…</p>}><DashboardBody {...props} /></Suspense>
      <div className="sticky bottom-0 border-t bg-background p-4"><Button className="h-12 w-full text-base" onClick={() => props.onOpenChange(false)}>Exit to till</Button></div>
    </DialogContent>
  </Dialog>;
}

function DashboardBody({ cashier, products }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [, refresh] = useState(0);
  const [history, setHistory] = useState<QueuedSale[]>([]);
  useEffect(() => {
    const update = () => { refresh((v) => v + 1); void deviceSales().then(setHistory); };
    update();
    window.addEventListener("tilla-queue", update);
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => { window.removeEventListener("tilla-queue", update); clearInterval(timer); };
  }, []);
  const { day, start, end } = harareDay(now);
  const { data: snapshot } = useSuspenseQuery({
    queryKey: ["sales", "cashier-day", cashier.storeId, cashier.id, day],
    queryFn: async () => {
      try {
        return await cached(`cashier-day:${day}`, async () => {
          const { data, error } = await supabase.from("sales").select("total, client_ref").eq("store_id", cashier.storeId).eq("cashier_id", cashier.id).gte("created_at", start).lt("created_at", end);
          if (error) throw error;
          return { sales: data ?? [], checkedAt: new Date().toISOString() };
        });
      } catch { return null; }
    },
    refetchInterval: 30000,
  });
  const queue = readQueue().filter((s) => s.store_id === cashier.storeId && s.user_id === cashier.id);
  const totals = cashierDailyTotals(snapshot?.sales ?? [], history, cashier.storeId, cashier.id, start, end);
  const low = products.filter((p) => Number(p.stock) <= Number(p.min_stock));
  const initials = cashier.name.split(/\s+/).slice(0, 2).map((s) => s[0]).join("");
  return <div className="space-y-5 p-5">
    <div className="flex items-center gap-3"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">{initials}</span><div className="min-w-0"><h2 className="break-words text-xl font-bold">{cashier.name}</h2><p className="text-sm text-muted-foreground">{day} · Harare</p></div></div>
    <div className="grid grid-cols-1 divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {[{ icon: ReceiptText, label: snapshot ? "Today's sales" : "Today on this device", value: money(totals.total), detail: `${totals.count} sales · ${totals.localCount} local` }, { icon: Package, label: "Stock on this till", value: `${products.length} products`, detail: `${low.length} low or out of stock` }, { icon: CloudOff, label: "Pending uploads", value: `${queue.length} sales`, detail: money(queue.reduce((n, s) => n + s.total, 0)) }].map((stat) => <div key={stat.label} className="min-w-0 py-4 sm:px-3"><stat.icon className="mb-2 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">{stat.label}</p><p className="break-words text-2xl font-bold tabular-nums">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.detail}</p></div>)}
    </div>
    <p className="text-xs text-muted-foreground">{snapshot ? `Shop records checked ${new Date(snapshot.checkedAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Harare" })} · USD` : "Shop sales unavailable · local sales only · USD"}</p>
    <section><h3 className="mb-2 font-semibold">Pending offline sales</h3>{!queue.length ? <p className="text-sm text-muted-foreground">All sales uploaded.</p> : <div className="max-h-48 overflow-y-auto divide-y">{queue.map((s) => <div key={s.client_ref} className="py-2"><div className="flex gap-2 text-sm"><span className="min-w-0 flex-1 break-all font-mono">{s.receipt?.sale_number ?? s.client_ref}</span><span className="shrink-0 font-semibold">{money(s.total)}</span></div><p className={s.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{s.error ?? "Waiting to upload"}</p></div>)}</div>}</section>
    <section><h3 className="mb-2 font-semibold">Low stock</h3>{!low.length ? <p className="text-sm text-muted-foreground">No low-stock products.</p> : <div className="max-h-48 overflow-y-auto divide-y">{low.map((p) => <div key={p.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 break-words">{p.name}</span><span className="shrink-0 font-semibold text-destructive">{Math.max(0, Number(p.stock))} left</span></div>)}</div>}</section>
  </div>;
}