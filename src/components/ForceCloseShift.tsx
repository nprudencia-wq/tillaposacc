import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchShiftSummary, type ShiftSummary } from "@/components/Shift";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/pos";

const CUR = [["usd", "USD"], ["zig", "ZiG"], ["zar", "ZAR"]] as const;

export function ForceCloseShiftDialog({ shift, onClose, onClosed }: { shift: { id: string; shift_number: string; cashier: string; opened_at: string }; onClose: () => void; onClosed: (s: ShiftSummary) => void }) {
  const qc = useQueryClient();
  const [sum, setSum] = useState<ShiftSummary | null>(null);
  const [count, setCount] = useState({ usd: "", zig: "", zar: "" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchShiftSummary(shift.id).then(setSum).catch((e) => toast.error((e as Error).message)); }, [shift.id]);
  const expected = (k: string) => Number((sum as unknown as Record<string, number> | null)?.[`expected_${k}`] ?? 0);
  async function submit() {
    setBusy(true);
    const { error } = await supabase.rpc("force_close_shift", { p_shift: shift.id, p_actual_usd: Number(count.usd) || 0, p_actual_zig: Number(count.zig) || 0, p_actual_zar: Number(count.zar) || 0, p_notes: notes });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${shift.shift_number} force closed`);
    qc.invalidateQueries({ queryKey: ["shifts"] });
    try { onClosed(await fetchShiftSummary(shift.id)); } catch { onClose(); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Force close {shift.shift_number}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{shift.cashier} · opened {new Date(shift.opened_at).toLocaleString()}</p>
        {!sum ? <p className="text-sm">Loading day collections…</p> : <>
          <p className="text-sm">Sales: <b>{sum.sales_count}</b> · {money(Number(sum.sales_total_usd))}</p>
          <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Currency</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>
            {CUR.map(([k, c]) => { const e = expected(k); const typed = count[k] !== ""; const v = (Number(count[k]) || 0) - e; return (
              <tr key={k} className="border-t"><td className="py-2 font-semibold">{c}</td><td className="tabular">{money(e, c)}</td>
                <td><Input type="number" min={0} step="0.01" aria-label={`Counted ${c}`} value={count[k]} onChange={(ev) => setCount({ ...count, [k]: ev.target.value })} className="h-9 w-28" /></td>
                <td className="tabular">{!typed ? "—" : Math.abs(v) < 0.005 ? <span className="text-success">Exact</span> : <span className={v < 0 ? "text-destructive" : "text-warning"}>{v < 0 ? "Short " : "Over "}{money(Math.abs(v), c)}</span>}</td></tr>); })}
          </tbody></table>
          <Button variant="outline" size="sm" onClick={() => setCount({ usd: expected("usd").toFixed(2), zig: expected("zig").toFixed(2), zar: expected("zar").toFixed(2) })}>Fill expected</Button>
          <p className="text-xs text-muted-foreground">Expected = opening float + cash sales − change − cash refunds + paid-ins − drops/payouts. Card, mobile money and account payments don't count as drawer cash.</p>
        </>}
        <Textarea placeholder="Reason, e.g. cashier left without cash-up" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button disabled={busy || !sum} variant="destructive" onClick={submit}>Force close shift</Button>
      </DialogContent>
    </Dialog>
  );
}
