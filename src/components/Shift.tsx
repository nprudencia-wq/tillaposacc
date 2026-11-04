import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cached, readQueue, syncQueue } from "@/lib/offline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, methodLabels, type Currency, type PayMethod } from "@/lib/pos";
import { cached } from "@/lib/offline";

export type ShiftSummary = {
  shift: {
    id: string; shift_number: string; status: string; opened_at: string; closed_at: string | null;
    opening_float_usd: number; opening_float_zig: number; actual_cash_usd: number | null; actual_cash_zig: number | null;
    variance_usd: number | null; variance_zig: number | null; notes: string | null; cashier_id: string;
  };
  sales_count: number; sales_total_usd: number;
  payments: { method: string; currency: string; amount: number }[];
  movements: { type: string; currency: string; amount: number; reason: string; created_at: string }[];
  cash_in_usd: number; cash_in_zig: number; change_usd: number; change_zig: number;
  refunds_usd: number; refunds_zig: number; paid_in_usd: number; paid_in_zig: number;
  paid_out_usd: number; paid_out_zig: number; expected_usd: number; expected_zig: number;
};

const moveLabels: Record<string, string> = { cash_drop: "Safe drop", paid_out: "Paid out", paid_in: "Paid in" };

export function useOpenShift() {
  return useQuery({
    queryKey: ["open-shift"],
    queryFn: () => cached("open-shift", async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return null;
      const { data, error } = await supabase.from("cashier_shifts").select("*")
        .eq("cashier_id", uid).eq("status", "open").maybeSingle();
      if (error) throw error;
      return data;
    }),
  });
}

export async function fetchShiftSummary(id: string) {
  const { data, error } = await supabase.rpc("shift_summary", { p_shift: id });
  if (error) throw error;
  return data as unknown as ShiftSummary;
}

export function OpenShiftGate() {
  const qc = useQueryClient();
  const [usd, setUsd] = useState("");
  const [zig, setZig] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const { error } = await supabase.rpc("open_shift", { p_float_usd: Number(usd) || 0, p_float_zig: Number(zig) || 0 });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Shift opened");
    qc.invalidateQueries({ queryKey: ["open-shift"] });
  }
  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-soft">
        <h1 className="font-display text-2xl font-bold">Open your till</h1>
        <p className="mt-1 text-sm text-muted-foreground">Count the starting cash in your drawer before you begin selling.</p>
        <label className="mt-5 block text-sm font-medium">Opening float (USD)
          <Input type="number" min={0} step="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} className="tabular mt-1" placeholder="0.00" />
        </label>
        <label className="mt-3 block text-sm font-medium">Opening float (ZiG)
          <Input type="number" min={0} step="0.01" value={zig} onChange={(e) => setZig(e.target.value)} className="tabular mt-1" placeholder="0.00" />
        </label>
        <Button size="lg" className="mt-5 w-full" disabled={busy} onClick={open}>Open shift</Button>
      </div>
    </div>
  );
}

export function ShiftBar({ shift, canReadX }: { shift: { id: string; shift_number: string; opened_at: string }; canReadX: boolean }) {
  const qc = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [report, setReport] = useState<{ title: string; s: ShiftSummary } | null>(null);
  async function xReport() {
    try { setReport({ title: "X-report (mid-shift)", s: await fetchShiftSummary(shift.id) }); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2 text-sm print:hidden">
      <span className="font-semibold">{shift.shift_number}</span>
      <span className="text-muted-foreground">opened {new Date(shift.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      <div className="ml-auto flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => setMoveOpen(true)}>Cash drop / payout</Button>
        {canReadX && <Button size="sm" variant="outline" onClick={xReport}>X-report</Button>}
        <Button size="sm" onClick={() => setCloseOpen(true)}>End shift</Button>
      </div>
      {moveOpen && <MovementDialog onClose={() => setMoveOpen(false)} />}
      {closeOpen && <CloseDialog shiftId={shift.id} onClose={() => { setCloseOpen(false); qc.invalidateQueries({ queryKey: ["open-shift"] }); }} onClosed={(s) => { setCloseOpen(false); setReport({ title: "Z-report (shift closed)", s }); }} />}
      {report && <ShiftReportDialog title={report.title} s={report.s} onClose={() => { const closed = report.s.shift.status === "closed"; setReport(null); if (closed) qc.invalidateQueries({ queryKey: ["open-shift"] }); }} />}
    </div>
  );
}

function MovementDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState("cash_drop");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("record_cash_movement", { p_type: type, p_currency: currency, p_amount: Number(amount), p_reason: reason });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${moveLabels[type]} recorded`);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Drawer cash movement</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label="Type of cash movement"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash_drop">Safe drop (cash to safe)</SelectItem>
              <SelectItem value="paid_out">Paid out (petty cash)</SelectItem>
              <SelectItem value="paid_in">Paid in (extra float)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="w-24" aria-label="Currency"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem></SelectContent>
            </Select>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount" className="tabular" />
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / voucher number" aria-label="Reason" />
          <Button className="w-full" disabled={busy} onClick={save}>Record</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ shiftId, onClose, onClosed }: { shiftId: string; onClose: () => void; onClosed: (s: ShiftSummary) => void }) {
  const qc = useQueryClient();
  const [usd, setUsd] = useState("");
  const [zig, setZig] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (usd === "" || zig === "") { toast.error("Enter the cash counted in both currencies (0 if none)"); return; }
    if (!navigator.onLine) { toast.error("You're offline. Reconnect to close the shift."); return; }
    setBusy(true);
    await syncQueue();
    if (readQueue().length) { setBusy(false); toast.error("Some offline sales haven't uploaded yet. Check the offline bar at the top, then try again."); return; }
    const { error } = await supabase.rpc("close_shift", { p_actual_usd: Number(usd), p_actual_zig: Number(zig), p_notes: notes });
    if (error) { setBusy(false); { toast.error(error.message); return; } }
    try { onClosed(await fetchShiftSummary(shiftId)); } catch (e) { toast.error((e as Error).message); onClose(); }
    // open-shift is refreshed when the Z-report is dismissed, so the report stays visible
    qc.invalidateQueries({ queryKey: ["shifts"] });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>End shift — count your drawer</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Count every note and coin in the drawer. The expected amount is shown only after you submit.</p>
        <label className="block text-sm font-medium">Cash counted (USD)
          <Input type="number" min={0} step="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} className="tabular mt-1" />
        </label>
        <label className="block text-sm font-medium">Cash counted (ZiG)
          <Input type="number" min={0} step="0.01" value={zig} onChange={(e) => setZig(e.target.value)} className="tabular mt-1" />
        </label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
        <Button className="w-full" disabled={busy} onClick={submit}>Submit count and close shift</Button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : ""} ${tone ?? ""}`}><span>{k}</span><span className="tabular">{v}</span></div>;
}

function varianceText(v: number, c: Currency) {
  if (Math.abs(v) < 0.005) return { text: "Exact", tone: "text-success" };
  return v < 0 ? { text: `Short ${money(-v, c)}`, tone: "text-destructive" } : { text: `Over ${money(v, c)}`, tone: "text-warning" };
}

export function ShiftReport({ s, title }: { s: ShiftSummary; title: string }) {
  const sh = s.shift;
  const closed = sh.status === "closed";
  const cur: Currency[] = ["USD", "ZiG"];
  const k = (c: Currency) => (c === "USD" ? "usd" : "zig");
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-display text-lg font-bold">{title}</div>
        <div className="text-muted-foreground">{sh.shift_number} · {new Date(sh.opened_at).toLocaleString()}{sh.closed_at ? ` – ${new Date(sh.closed_at).toLocaleTimeString()}` : " (still open)"}</div>
      </div>
      <div className="space-y-1 border-t pt-2">
        <Row k="Sales" v={`${s.sales_count} · ${money(Number(s.sales_total_usd))}`} strong />
        {s.payments.map((p) => <Row key={p.method + p.currency} k={`${methodLabels[p.method as PayMethod] ?? p.method} (${p.currency})`} v={money(Number(p.amount), p.currency as Currency)} />)}
      </div>
      {cur.map((c) => {
        const g = (f: string) => Number((s as unknown as Record<string, number>)[`${f}_${k(c)}`] ?? 0);
        const float = Number(c === "USD" ? sh.opening_float_usd : sh.opening_float_zig);
        const actual = c === "USD" ? sh.actual_cash_usd : sh.actual_cash_zig;
        const variance = c === "USD" ? sh.variance_usd : sh.variance_zig;
        const vt = variance != null ? varianceText(Number(variance), c) : null;
        return (
          <div key={c} className="space-y-1 border-t pt-2">
            <div className="font-semibold">{c} cash drawer</div>
            <Row k="Opening float" v={money(float, c)} />
            <Row k="+ Cash sales" v={money(g("cash_in"), c)} />
            <Row k="− Change given" v={money(g("change"), c)} />
            <Row k="− Cash refunds" v={money(g("refunds"), c)} />
            <Row k="+ Paid in" v={money(g("paid_in"), c)} />
            <Row k="− Drops & paid out" v={money(g("paid_out"), c)} />
            <Row k="Expected in drawer" v={money(Number(s[`expected_${k(c)}` as "expected_usd"]), c)} strong />
            {closed && actual != null && <Row k="Counted" v={money(Number(actual), c)} strong />}
            {vt && <Row k="Variance" v={vt.text} strong tone={vt.tone} />}
          </div>
        );
      })}
      {s.movements.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="font-semibold">Cash movements</div>
          {s.movements.map((m, i) => <Row key={i} k={`${moveLabels[m.type]} · ${m.reason}`} v={money(Number(m.amount), m.currency as Currency)} />)}
        </div>
      )}
      {sh.notes && <div className="border-t pt-2 text-muted-foreground">Notes: {sh.notes}</div>}
      {closed && <div className="pt-6 text-muted-foreground">Cashier signature: ____________________</div>}
    </div>
  );
}

export function ShiftReportDialog({ s, title, onClose }: { s: ShiftSummary; title: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div id="receipt-print"><ShiftReport s={s} title={title} /></div>
        <Button variant="outline" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" />Print</Button>
      </DialogContent>
    </Dialog>
  );
}
