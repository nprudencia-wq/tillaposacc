import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/pos";
import { activeTypes, usePaymentTypes } from "@/lib/payment-types";

export function RefundDialog({ sale, onClose }: { sale: { id: string; sale_number: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["sale-items", sale.id],
    queryFn: async () => (await supabase.from("sale_items").select("*").eq("sale_id", sale.id)).data ?? [],
  });
  const {data:types}=usePaymentTypes();
  const methods=activeTypes(types);
  const [method,setMethod]=useState("");
  const [reference] = useState(() => crypto.randomUUID());
  const [condition,setCondition] = useState("sellable");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { data, error } = await supabase.rpc("credit_note_refund", { p_client_ref: reference,
      p_sale: sale.id,
      p_items: Object.entries(qty).map(([sale_item_id, quantity]) => ({ sale_item_id, quantity, condition })) as never,
      p_reason: reason, p_method: method,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Credit note issued — open Sales documents to print");
    qc.invalidateQueries({queryKey:["documents"]});
    qc.invalidateQueries({queryKey:["customer-ledger"]});
    toast.success(`Refunded ${money(Number((data as { amount: number }).amount))} — stock returned`);
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Refund {sale.sale_number}</DialogTitle></DialogHeader>
        {items.map((i) => {
          const left = Number(i.quantity) - Number(i.refunded_qty);
          return (
            <div key={i.id} className="flex items-center gap-3">
              <div className="flex-1 text-sm"><div className="font-medium">{i.name}</div><div className="text-xs text-muted-foreground">{left} of {Number(i.quantity)} refundable · {money(Number(i.unit_price))}</div></div>
              <Input type="number" min={0} max={left} disabled={left <= 0} className="w-20" value={qty[i.id] || ""}
                onChange={(e) => setQty({ ...qty, [i.id]: Math.min(left, Math.max(0, Number(e.target.value))) })} />
            </div>
          );
        })}
        <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged bottle" /></div>
        <Select value={condition} onValueChange={setCondition}><SelectTrigger aria-label="Return condition"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sellable">Return to sellable stock</SelectItem><SelectItem value="damaged">Damaged — write off stock</SelectItem></SelectContent></Select>
        <Select value={method} onValueChange={setMethod}><SelectTrigger aria-label="Refund settlement"><SelectValue placeholder="Choose refund method"/></SelectTrigger><SelectContent>{methods.map(m=><SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}</SelectContent></Select>
        <Button variant="destructive" disabled={busy || !reason || !method} onClick={save}>Process refund</Button>
      </DialogContent>
    </Dialog>
  );
}
