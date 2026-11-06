import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateShiftHandover } from "@/lib/handover.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Shift = { id: string; shift_number: string; cashier: string; notes: string | null; manager_notes: string | null; handover_summary: string | null };

export function ShiftHandoverDialog({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const gen = useServerFn(generateShiftHandover);
  const qc = useQueryClient();
  const [notes, setNotes] = useState(shift.manager_notes ?? "");
  const [summary, setSummary] = useState(shift.handover_summary ?? "");
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);

  async function generate() {
    setBusy("ai");
    try { setSummary((await gen({ data: { shiftId: shift.id, notes } })).summary); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }
  async function save() {
    setBusy("save");
    const { error } = await supabase.rpc("save_shift_handover", { p_shift: shift.id, p_notes: notes, p_summary: summary });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Handover saved");
    qc.invalidateQueries({ queryKey: ["shifts"] });
    onClose();
  }
  function print() {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    w.document.body.innerText = `Handover — ${shift.shift_number} (${shift.cashier})\n\n${summary}`;
    w.document.body.style.cssText = "font-family:monospace;white-space:pre-wrap;padding:12px";
    w.print();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Handover — {shift.shift_number} · {shift.cashier}</DialogTitle></DialogHeader>
        {shift.notes && <p className="rounded-md bg-muted p-3 text-sm"><b>Cashier's closing note:</b> {shift.notes}</p>}
        <div className="space-y-1.5">
          <Label htmlFor="mgr-notes">Your shift notes</Label>
          <Textarea id="mgr-notes" rows={5} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Bread delivery short by 10 loaves; printer paper low; customer Moyo promised to pay Friday." />
        </div>
        <Button onClick={generate} disabled={!!busy}>{busy === "ai" ? "Writing handover…" : summary ? "Write again with AI" : "Write handover with AI"}</Button>
        <div className="space-y-1.5">
          <Label htmlFor="summary">Handover summary (you can edit it)</Label>
          <Textarea id="summary" rows={12} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="The AI summary appears here." />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={!summary} onClick={() => { void navigator.clipboard.writeText(summary); toast.success("Copied"); }}>Copy</Button>
          <Button variant="outline" disabled={!summary} onClick={print}>Print</Button>
          <Button onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save handover"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
