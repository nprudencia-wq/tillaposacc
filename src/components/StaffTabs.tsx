import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/pos";
import { isValidPin } from "@/lib/username";
import { exportExcel as xl, exportPDF as pdf } from "@/lib/export";

const shape = (head: string[], rows: string[][]) => ({
  cols: head.map((label, i) => ({ key: `c${i}`, label })),
  rows: rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v]))),
});
const exportPDF = (title: string, head: string[], rows: string[][]) => { const x = shape(head, rows); return pdf(title.toLowerCase().replace(/\s+/g, "-"), title, "", x.cols, x.rows); };
const exportExcel = (file: string, head: string[], rows: string[][]) => { const x = shape(head, rows); return xl(file, "Sheet1", x.cols, x.rows); };

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const endOf = (d: string) => new Date(d + "T23:59:59.999").toISOString();
const startOf = (d: string) => new Date(d + "T00:00:00").toISOString();

function useNames() {
  return useQuery({
    queryKey: ["staff-names"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, username");
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name || p.username || "—"])) as Record<string, string>;
    },
  });
}

function Range({ from, to, setFrom, setTo, children }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label htmlFor="sf">From</Label><Input id="sf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="st">To</Label><Input id="st" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      {children}
    </div>
  );
}

const hrs = (ms: number) => `${Math.floor(ms / 3600000)}h ${String(Math.round((ms % 3600000) / 60000)).padStart(2, "0")}m`;

export function AttendanceTab() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const { data: names = {} } = useNames();
  const { data = [] } = useQuery({
    queryKey: ["attendance", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("time_clock").select("*").gte("clock_in", startOf(from)).lte("clock_in", endOf(to)).order("clock_in", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const totals: Record<string, number> = {};
  data.forEach((r) => { totals[r.user_id] = (totals[r.user_id] ?? 0) + ((r.clock_out ? new Date(r.clock_out).getTime() : Date.now()) - new Date(r.clock_in).getTime()); });
  const rows = data.map((r) => [names[r.user_id] ?? "—", new Date(r.clock_in).toLocaleString(), r.clock_out ? new Date(r.clock_out).toLocaleString() : "Still in",
    hrs((r.clock_out ? new Date(r.clock_out).getTime() : Date.now()) - new Date(r.clock_in).getTime())]);
  const head = ["Staff", "Clock in", "Clock out", "Hours"];
  return (
    <div className="space-y-4">
      <Range {...{ from, to, setFrom, setTo }}>
        <Button variant="outline" onClick={() => exportPDF(`Attendance ${from} to ${to}`, head, rows)}>PDF</Button>
        <Button variant="outline" onClick={() => exportExcel(`attendance-${from}-${to}`, head, rows)}>Excel</Button>
      </Range>
      <div className="flex flex-wrap gap-2">
        {Object.entries(totals).map(([u, ms]) => <div key={u} className="rounded-lg border bg-card px-3 py-2 text-sm"><span className="font-semibold">{names[u] ?? "—"}</span> · {hrs(ms)}</div>)}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card"><Table>
        <TableHeader><TableRow>{head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No clock-ins in these dates</TableCell></TableRow>}
        </TableBody>
      </Table></div>
    </div>
  );
}

const actionLabels: Record<string, string> = {
  login: "Signed in (password)", pin_login: "Signed in (PIN)", pin_failed: "Wrong PIN", logout: "Signed out", pin_set: "PIN set",
  clock_in: "Clocked in", clock_out: "Clocked out", sale: "Sale", refund: "Refund", shift_open: "Opened shift", shift_close: "Closed shift",
  cash_drop: "Cash drop", paid_out: "Paid out", paid_in: "Paid in", expense: "Expense", price_change: "Price change",
  role_change: "Role change", access_change: "Access change", debt_payment: "Debt payment", balance_charge: "Balance added", balance_credit: "Balance reduced",
};
const label = (a: string) => actionLabels[a] ?? a.replace(/^stock_/, "Stock: ").replace(/_/g, " ");

export function ActivityTab() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [who, setWho] = useState("");
  const { data: names = {} } = useNames();
  const { data = [] } = useQuery({
    queryKey: ["activity", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_log").select("*").gte("created_at", startOf(from)).lte("created_at", endOf(to)).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const rows = data.filter((r) => !who || r.user_id === who).map((r) => [new Date(r.created_at).toLocaleString(), r.user_id ? names[r.user_id] ?? "—" : "System", label(r.action), r.details ?? ""]);
  const head = ["When", "Staff", "Action", "Details"];
  return (
    <div className="space-y-4">
      <Range {...{ from, to, setFrom, setTo }}>
        <div className="space-y-1"><Label htmlFor="who">Staff</Label>
          <select id="who" className="h-10 rounded-md border bg-background px-3 text-sm" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </div>
        <Button variant="outline" onClick={() => exportPDF(`Activity ${from} to ${to}`, head, rows)}>PDF</Button>
        <Button variant="outline" onClick={() => exportExcel(`activity-${from}-${to}`, head, rows)}>Excel</Button>
      </Range>
      <div className="overflow-x-auto rounded-xl border bg-card"><Table>
        <TableHeader><TableRow>{head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className={j === 0 ? "whitespace-nowrap text-sm" : ""}>{c}</TableCell>)}</TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No activity in these dates</TableCell></TableRow>}
        </TableBody>
      </Table></div>
    </div>
  );
}

export function PerformanceTab() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const { data: names = {} } = useNames();
  const { data = [] } = useQuery({
    queryKey: ["cashier-perf", from, to],
    queryFn: async () => {
      const [{ data: sales }, { data: refunds }, { data: shifts }] = await Promise.all([
        supabase.from("sales").select("cashier_id, subtotal, discount, total").gte("created_at", startOf(from)).lte("created_at", endOf(to)).limit(10000),
        supabase.from("refunds").select("refunded_by, amount").gte("created_at", startOf(from)).lte("created_at", endOf(to)),
        supabase.from("cashier_shifts").select("cashier_id, variance_usd").eq("status", "closed").gte("opened_at", startOf(from)).lte("opened_at", endOf(to)),
      ]);
      const m: Record<string, { n: number; gross: number; disc: number; net: number; ref: number; varc: number }> = {};
      const g = (id: string) => (m[id] ??= { n: 0, gross: 0, disc: 0, net: 0, ref: 0, varc: 0 });
      (sales ?? []).forEach((s) => { const e = g(s.cashier_id); e.n++; e.gross += Number(s.subtotal); e.disc += Number(s.discount); e.net += Number(s.total); });
      (refunds ?? []).forEach((r) => { g(r.refunded_by).ref += Number(r.amount); });
      (shifts ?? []).forEach((s) => { g(s.cashier_id).varc += Number(s.variance_usd ?? 0); });
      return Object.entries(m).sort((a, b) => b[1].net - a[1].net);
    },
  });
  const head = ["Cashier", "Receipts", "Gross", "Discounts", "Refunds", "Net sales", "Average sale", "Cash-up over/short"];
  const rows = data.map(([id, e]) => [names[id] ?? "—", String(e.n), money(e.gross), money(e.disc), money(e.ref), money(e.net - e.ref), money(e.n ? e.net / e.n : 0), money(e.varc)]);
  return (
    <div className="space-y-4">
      <Range {...{ from, to, setFrom, setTo }}>
        <Button variant="outline" onClick={() => exportPDF(`Cashier performance ${from} to ${to}`, head, rows)}>PDF</Button>
        <Button variant="outline" onClick={() => exportExcel(`cashier-performance-${from}-${to}`, head, rows)}>Excel</Button>
      </Range>
      <div className="overflow-x-auto rounded-xl border bg-card"><Table>
        <TableHeader><TableRow>{head.map((h, i) => <TableHead key={h} className={i ? "text-right" : ""}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className={j ? "tabular text-right" : "font-medium"}>{c}</TableCell>)}</TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No sales in these dates</TableCell></TableRow>}
        </TableBody>
      </Table></div>
      <p className="text-sm text-muted-foreground">Refunds are counted against the person who gave them. Over/short is the total from closed shifts (negative means short).</p>
    </div>
  );
}

export function PinDialog({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin)) { toast.error("PIN must be exactly 4 digits"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_staff_pin", { p_user: userId, p_pin: pin });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Till PIN set for ${name}`); onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Till PIN · {name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted-foreground">They sign in at the till with their username and this PIN. 5 wrong tries locks PIN sign-in for 5 minutes.</p>
          <div className="space-y-1.5"><Label htmlFor="newpin">New PIN (4 digits)</Label>
            <Input id="newpin" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required /></div>
          <Button type="submit" className="w-full" disabled={busy}>Save PIN</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
