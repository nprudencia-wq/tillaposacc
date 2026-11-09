import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, LockKeyhole, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cached, closeShiftOffline, deviceSales, isNetworkError, openLocalShift, readLocalShift, readPendingClose, readQueue, syncQueue } from "@/lib/offline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, type Currency, type PayMethod } from "@/lib/pos";
import { isCashMethod, methodLabel } from "@/lib/payment-types";
import { mergeShiftReport, type ShiftSnapshot } from "@/lib/shift-report";
import { summarizeItemsSold, type SoldSummary } from "@/lib/items-sold";
import { useStaff } from "@/hooks/use-staff";
import { deviceSession } from "@/lib/offline-session";
import { internetAvailable } from "@/lib/connectivity";

export type ShiftSummary = {
  local?: boolean; checkedAt?: string; items?: SoldSummary[];
  shift: {
    id: string; shift_number: string; status: string; opened_at: string; closed_at: string | null;
    opening_float_zar: number; actual_cash_zar: number | null; variance_zar: number | null;
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
  const { data: me } = useStaff();
  return useQuery({
    queryKey: ["open-shift", me?.id, me?.storeId],
    enabled: !!me,
    queryFn: async () => {
      // A shift opened on this device without internet stays in charge until it has uploaded.
      const local = await readLocalShift();
      if (local) return local;
      const open = await fetchOpen();
      // A shift ended on this device without internet counts as closed even before it uploads.
      const pending = await readPendingClose();
      if (open && pending?.shift_id === open.id) return null;
      return open;
    },
  });
}

async function fetchOpen() {
  try {
    return await cached("open-shift", async () => {
      const uid = (await deviceSession())?.user.id;
      if (!uid) return null;
      const { data, error } = await supabase.from("cashier_shifts").select("*")
        .eq("cashier_id", uid).eq("status", "open").maybeSingle();
      if (error) throw error;
      return data;
    });
  } catch (e) {
    // Offline with no saved shift: let the cashier open one on this till.
    if (isNetworkError(e) || /No saved copy/.test((e as Error).message)) return null;
    throw e;
  }
}

export async function fetchShiftSummary(id: string) {
  const pending = await readPendingClose();
  const local = await readLocalShift() ?? pending?.local_shift;
  let snapshot: ShiftSnapshot;
  if (local?.id === id) {
    snapshot = { refs: [], lines: [], checkedAt: local.opened_at, summary: {
      shift: { ...local, closed_at: null, actual_cash_usd: null, actual_cash_zig: null, actual_cash_zar: null, variance_usd: null, variance_zig: null, variance_zar: null, notes: null },
      sales_count: 0, sales_total_usd: 0, payments: [], movements: [], cash_in_usd: 0, cash_in_zig: 0, change_usd: 0, change_zig: 0,
      refunds_usd: 0, refunds_zig: 0, paid_in_usd: 0, paid_in_zig: 0, paid_out_usd: 0, paid_out_zig: 0,
      expected_usd: local.opening_float_usd, expected_zig: local.opening_float_zig,
      ...{ expected_zar: local.opening_float_zar },
    } };
  } else snapshot = await cached(`shift-report:${id}`, async () => {
    const { data, error } = await supabase.rpc("shift_summary", { p_shift: id });
    if (error) throw error;
    const sales: { client_ref: string | null; sale_items: { product_id: string | null; name: string; quantity: number; refunded_qty: number; line_total: number }[] }[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from("sales").select("client_ref, sale_items(product_id, name, quantity, refunded_qty, line_total)").eq("shift_id", id).order("id").range(offset, offset + 499);
      if (result.error) throw result.error;
      sales.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) break;
    }
    return { summary: data as unknown as ShiftSummary, refs: sales.flatMap((s) => s.client_ref ? [s.client_ref] : []), lines: sales.flatMap((s) => s.sale_items), checkedAt: new Date().toISOString() };
  });
  const result = mergeShiftReport(snapshot, await deviceSales(), isCashMethod);
  const summary = { ...result.summary, items: result.items, local: !internetAvailable() || local?.id === id, checkedAt: snapshot.checkedAt };
  if (pending?.shift_id === id) {
    summary.shift = { ...summary.shift, status: "closed", closed_at: pending.closed_at, notes: pending.notes,
      actual_cash_usd: pending.usd, actual_cash_zig: pending.zig, actual_cash_zar: pending.zar,
      variance_usd: pending.usd - summary.expected_usd, variance_zig: pending.zig - summary.expected_zig,
      variance_zar: pending.zar - Number((summary as unknown as Record<string, number>).expected_zar ?? 0) };
    summary.local = true;
  }
  return summary;
}

export function OpenShiftGate() {
  const qc = useQueryClient();
  const [usd, setUsd] = useState("");
  const [zig, setZig] = useState("");
  const [zar, setZar] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [report, setReport] = useState<ShiftSummary | null>(null);
  useEffect(() => { void readPendingClose().then((p) => setPendingId(p?.shift_id ?? null)); }, []);
  async function open() {
    setBusy(true);
    const floats = { usd: Number(usd) || 0, zig: Number(zig) || 0, zar: Number(zar) || 0 };
    const openOffline = async () => {
      try { await openLocalShift(floats); } catch (e) { setBusy(false); toast.error((e as Error).message); return; }
      setBusy(false);
      toast.success("Shift opened offline — it will upload when the internet is back");
      qc.invalidateQueries({ queryKey: ["open-shift"] });
    };
    // Always give an opening a stable local ID; the idempotent uploader creates it online.
    await openOffline();
    if (navigator.onLine) void syncQueue().then(() => qc.invalidateQueries({ queryKey: ["open-shift"] }));
  }
  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-soft">
        <h1 className="font-display text-2xl font-bold">Open your till</h1>
        {pendingId && <Button variant="outline" className="mt-3 w-full" onClick={() => void fetchShiftSummary(pendingId).then(setReport).catch((e) => toast.error(e.message))}>Last offline Z-report</Button>}
        <p className="mt-1 text-sm text-muted-foreground">Count the starting cash in your drawer before you begin selling.</p>
        <label className="mt-5 block text-sm font-medium">Opening float (USD)
          <Input type="number" min={0} step="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} className="tabular mt-1" placeholder="0.00" />
        </label>
        <label className="mt-3 block text-sm font-medium">Opening float (ZiG)
          <Input type="number" min={0} step="0.01" value={zig} onChange={(e) => setZig(e.target.value)} className="tabular mt-1" placeholder="0.00" />
        </label>
        <label className="mt-3 block text-sm font-medium">Opening float (Rand)<Input type="number" min={0} step="0.01" value={zar} onChange={(e) => setZar(e.target.value)} /></label>
        <Button size="lg" className="mt-5 w-full" disabled={busy} onClick={open}>Open shift</Button>
      </div>
      {report && <ShiftReportDialog s={report} title="Z-report (saved on till)" onClose={() => setReport(null)} />}
    </div>
  );
}

export function ShiftBar({ shift, canReadX }: { shift: { id: string; shift_number: string; opened_at: string }; canReadX: boolean }) {
  const qc = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [report, setReport] = useState<{ title: string; s: ShiftSummary } | null>(null);
  useEffect(() => {
    const warm = () => { if (internetAvailable()) void fetchShiftSummary(shift.id).catch(() => {}); };
    warm();
    const timer = setInterval(warm, 30000);
    window.addEventListener("tilla-sync", warm);
    window.addEventListener("tilla-sale", warm);
    return () => { clearInterval(timer); window.removeEventListener("tilla-sync", warm); window.removeEventListener("tilla-sale", warm); };
  }, [shift.id]);
  async function xReport() {
    try { setReport({ title: "X-report (mid-shift)", s: await fetchShiftSummary(shift.id) }); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2 text-sm print:hidden">
      <span className="font-semibold">{shift.shift_number}</span>
      <span className="text-muted-foreground">opened {new Date(shift.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      <div className="ml-auto flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => internetAvailable() ? setMoveOpen(true) : toast.error("Cash drops and payouts need internet to record the drawer audit.")}>Cash drop / payout</Button>
        {canReadX && <Button size="sm" variant="outline" onClick={xReport}>X-report</Button>}
        <Button size="sm" onClick={() => setCloseOpen(true)}><LockKeyhole className="h-4 w-4" />Close shift</Button>
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
              <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem><SelectItem value="ZAR">Rand</SelectItem></SelectContent>
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
  const { data: me } = useStaff();
  const [review, setReview] = useState(false);
  const [usd, setUsd] = useState("");
  const [zig, setZig] = useState("");
  const [zar, setZar] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const countValid = [usd, zig, zar].every((v) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0);
  async function submit() {
    if (usd === "" || zig === "" || zar === "") { toast.error("Enter the cash counted in all three currencies (0 if none)"); return; }
    if (!countValid) { toast.error("Enter valid, non-negative cash counts"); return; }
    setBusy(true);
    const closeOffline = async () => {
      let summary: ShiftSummary | null = null;
      try { summary = await fetchShiftSummary(shiftId); } catch { /* no downloaded report: still allow durable closure */ }
      try { await closeShiftOffline(shiftId, { usd: Number(usd), zig: Number(zig), zar: Number(zar), notes }); }
      catch (e) { setBusy(false); toast.error((e as Error).message); return; }
      setBusy(false);
      toast.success("Shift closed offline — the count and Z-report upload when the internet is back");
      qc.invalidateQueries({ queryKey: ["open-shift"] });
      if (summary) {
        try { onClosed(await fetchShiftSummary(shiftId)); } catch { onClose(); }
      } else onClose();
    };
    if (!internetAvailable()) { await closeOffline(); return; }
    await syncQueue();
    if (!internetAvailable()) { await closeOffline(); return; }
    if (readQueue().length || (await readLocalShift()) || (await readPendingClose())) { setBusy(false); toast.error("Some offline sales haven't uploaded yet. Check the offline bar at the top, then try again."); return; }
    const { error } = await supabase.rpc("close_shift_three", { p_actual_zar: Number(zar), p_actual_usd: Number(usd), p_actual_zig: Number(zig), p_notes: notes });
    if (error && isNetworkError(error)) { await closeOffline(); return; }
    if (error) { setBusy(false); { toast.error(error.message); return; } }
    try { onClosed(await fetchShiftSummary(shiftId)); } catch (e) { toast.error((e as Error).message); onClose(); }
    // open-shift is refreshed when the Z-report is dismissed, so the report stays visible
    qc.invalidateQueries({ queryKey: ["shifts"] });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto p-0" onEscapeKeyDown={(e) => busy && e.preventDefault()} onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader className="bg-sidebar p-5 text-sidebar-foreground"><DialogTitle>{review ? "Review & settle till" : "Close your shift"}</DialogTitle></DialogHeader>
        <div className="space-y-5 p-5">
          <div className="flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{me?.name.split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}</span><div><p className="font-semibold">{me?.name}</p><p className="text-sm text-muted-foreground">{review ? "2 · Confirm settlement" : "1 · Count the drawer"}</p></div></div>
          {!review ? <>
            <p className="text-sm text-muted-foreground">Enter the notes and coins in each currency. Use 0 where there is no cash.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-semibold">Cash counted (USD)<Input autoFocus type="number" min={0} step="0.01" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} className="mt-2 h-14 text-xl tabular-nums" placeholder="0.00" /></label>
              <label className="block text-sm font-semibold">Cash counted (ZiG)<Input type="number" min={0} step="0.01" inputMode="decimal" value={zig} onChange={(e) => setZig(e.target.value)} className="mt-2 h-14 text-xl tabular-nums" placeholder="0.00" /></label>
              <label className="block text-sm font-semibold">Cash counted (Rand)<Input type="number" min={0} step="0.01" inputMode="decimal" value={zar} onChange={(e) => setZar(e.target.value)} className="mt-2 h-14 text-xl tabular-nums" placeholder="0.00" /></label>
            </div>
            <label className="block text-sm font-semibold">Shift notes<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shortages, cash drops or handover notes" className="mt-2" /></label>
            <p className="text-xs text-muted-foreground">Expected cash and any shortage or surplus appear on the Z-report after closing.</p>
          </> : <>
            <div className="space-y-3 border-y py-4"><h3 className="font-semibold">Cash counted</h3><Row k="USD" v={money(Number(usd), "USD")} strong /><Row k="ZiG" v={money(Number(zig), "ZiG")} strong /><Row k="Rand" v={money(Number(zar), "ZAR")} strong /></div>
            {notes && <p className="break-words text-sm text-muted-foreground">{notes}</p>}
            <p className="text-sm text-muted-foreground">{internetAvailable() ? "Pending sales upload before settlement. Your Z-report follows once the shift closes." : "Your closing count is saved on this till. Sales and settlement upload when the internet returns."}</p>
          </>}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" disabled={busy} onClick={() => review ? setReview(false) : onClose()}><ArrowLeft className="h-4 w-4" />{review ? "Edit counts" : "Return to till"}</Button>
            <Button className="h-12 flex-1" disabled={busy || !countValid} onClick={() => review ? void submit() : setReview(true)}><CheckCircle2 className="h-4 w-4" />{busy ? "Settling till…" : review ? "Confirm & close shift" : "Review counts"}</Button>
          </div>
        </div>
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
  const cur: Currency[] = ["USD", "ZiG", "ZAR"];
  const k = (c: Currency) => (c === "USD" ? "usd" : c === "ZiG" ? "zig" : "zar");
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-display text-lg font-bold">{title}</div>
        <div className="text-muted-foreground">{sh.shift_number} · {new Date(sh.opened_at).toLocaleString()}{sh.closed_at ? ` – ${new Date(sh.closed_at).toLocaleTimeString()}` : " (still open)"}</div>
        {s.local && <div className="text-xs text-muted-foreground">Saved shop figures + sales on this till{ s.checkedAt ? ` · last checked ${new Date(s.checkedAt).toLocaleTimeString()}` : "" }</div>}
      </div>
      <div className="space-y-1 border-t pt-2">
        <Row k="Sales" v={`${s.sales_count} · ${money(Number(s.sales_total_usd))}`} strong />
        {s.payments.map((p) => <Row key={p.method + p.currency} k={`${methodLabel(p.method)} (${p.currency})`} v={money(Number(p.amount), p.currency as Currency)} />)}
      </div>
      {cur.map((c) => {
        const g = (f: string) => Number((s as unknown as Record<string, number>)[`${f}_${k(c)}`] ?? 0);
        const float = Number(c === "USD" ? sh.opening_float_usd : c === "ZiG" ? sh.opening_float_zig : sh.opening_float_zar);
        const actual = c === "USD" ? sh.actual_cash_usd : c === "ZiG" ? sh.actual_cash_zig : sh.actual_cash_zar;
        const variance = c === "USD" ? sh.variance_usd : c === "ZiG" ? sh.variance_zig : sh.variance_zar;
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

function ItemsSold({ items }: { items: SoldSummary[] }) {
  return (
    <div className="space-y-1 border-t pt-2 text-sm">
      <div className="font-semibold">Products sold</div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>Item</span><span>Sold · Ret · Net</span></div>
      {items.map((i) => <Row key={i.name} k={i.name} v={`${i.sold} · ${i.refunded} · ${i.net}`} />)}
      {!items.length && <div className="text-muted-foreground">No items sold in this shift.</div>}
      <Row k="Total units out" v={String(items.reduce((a, i) => a + i.net, 0))} strong />
    </div>
  );
}

export function ShiftReportDialog({ s, title, onClose }: { s: ShiftSummary; title: string; onClose: () => void }) {
  const [show, setShow] = useState(false);
  const [printItems, setPrintItems] = useState(false);
  const { data: items, isLoading, error } = useQuery({
    queryKey: ["shift-items", s.shift.id],
    enabled: show,
    queryFn: async () => {
      return s.items ?? (await fetchShiftSummary(s.shift.id)).items ?? [];
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div id="receipt-print">
          <ShiftReport s={s} title={title} />
          {show && items && <div className={printItems ? "" : "print:hidden"}><ItemsSold items={items} /></div>}
        </div>
        <div className="space-y-2 border-t pt-2 print:hidden">
          <Button variant="secondary" className="w-full" onClick={() => setShow((v) => !v)}>{show ? "Hide items sold" : "View items sold"}</Button>
          {show && isLoading && <p className="text-sm text-muted-foreground">Loading items…</p>}
          {show && error && <p className="text-sm text-destructive">Items unavailable on this till. Connect once to download the shift.</p>}
          {show && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={printItems} onChange={(e) => setPrintItems(e.target.checked)} />
              Include items sold when printing
            </label>
          )}
        </div>
        <Button variant="outline" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" />Print</Button>
      </DialogContent>
    </Dialog>
  );
}
