import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReceiptActions, type ReceiptData } from "@/components/Receipt";
import { money, type Currency, type PayMethod } from "@/lib/pos";
import { useSettings } from "@/hooks/use-staff";
import { toast } from "sonner";

/** Till-side lookup of recent sales so a cashier can find and reprint a receipt. */
export function RecentReceipts({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: settings } = useSettings();
  const [q, setQ] = useState("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", "till-recent", q.trim()],
    enabled: open,
    queryFn: async () => {
      let query = supabase.from("sales").select("id, sale_number, created_at, cashier_id, currency, exchange_rate, subtotal, discount, total, change_given").order("created_at", { ascending: false }).limit(30);
      const term = q.trim();
      if (term) query = query.ilike("sale_number", `%${term}%`);
      return (await query).data ?? [];
    },
  });

  async function open_(s: (typeof sales)[number]) {
    const [{ data: items, error }, { data: pays }, { data: prof }] = await Promise.all([
      supabase.from("sale_items").select("*").eq("sale_id", s.id),
      supabase.from("sale_payments").select("*").eq("sale_id", s.id),
      supabase.from("profiles").select("full_name").eq("id", s.cashier_id).maybeSingle(),
    ]);
    if (error) { toast.error("Couldn't load that receipt"); return; }
    setReceipt({
      sale_number: s.sale_number, created_at: s.created_at, business: settings?.business_name ?? "",
      cashier: prof?.full_name ?? "", currency: s.currency as Currency, rate: Number(s.exchange_rate),
      items: (items ?? []).map((i) => ({ name: i.name, quantity: Number(i.quantity), unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
      subtotal: Number(s.subtotal), discount: Number(s.discount), total: Number(s.total), change: Number(s.change_given),
      payments: (pays ?? []).map((p) => ({ method: p.method as PayMethod, currency: p.currency as Currency, amount: Number(p.amount) })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setReceipt(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{receipt ? `Reprint ${receipt.sale_number}` : "Recent receipts"}</DialogTitle></DialogHeader>
        {receipt ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setReceipt(null)}><ArrowLeft className="h-4 w-4" />Back to list</Button>
            <ReceiptActions r={receipt} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input autoFocus className="pl-8" placeholder="Search receipt number" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-[55vh] divide-y overflow-y-auto rounded-lg border">
              {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
              {!isLoading && sales.length === 0 && <p className="p-3 text-sm text-muted-foreground">No sales found. Sales saved offline appear here after they upload.</p>}
              {sales.map((s) => {
                const cur = s.currency as Currency;
                const amt = cur !== "USD" ? Number(s.total) * Number(s.exchange_rate) : Number(s.total);
                return (
                  <button key={s.id} className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted" onClick={() => open_(s)}>
                    <span><span className="font-medium">{s.sale_number}</span><br /><span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span></span>
                    <span className="font-medium">{money(amt, cur)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
