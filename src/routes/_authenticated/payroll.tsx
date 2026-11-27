import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calcPay } from "@/lib/payroll";

export const Route = createFileRoute("/_authenticated/payroll")({
  head: () => ({ meta: [{ title: "Payroll — Tilla POS" }, { name: "description", content: "Monthly salaries with Zimbabwe PAYE, AIDS levy and NSSA, plus printable payslips." }, { property: "og:title", content: "Payroll — Tilla POS" }, { property: "og:description", content: "Monthly salaries with Zimbabwe PAYE, AIDS levy and NSSA, plus printable payslips." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PayrollPage,
});

const usd = (n: number) => `US$${Number(n).toFixed(2)}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
type Line = { id?: string; user_id: string; name: string; basic: number; allowances: number; bonus: number; gross: number; nssa_employee: number; nssa_employer: number; paye: number; aids_levy: number; advances: number; net: number };

function useStaffPay() {
  return useQuery({ queryKey: ["payroll-staff"], queryFn: async () => {
    const [{ data: people, error }, { data: prof, error: e2 }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, active").order("full_name"),
      supabase.from("staff_pay_profiles").select("*"),
    ]);
    if (error || e2) throw error ?? e2;
    const map = new Map((prof ?? []).map((p) => [p.user_id, p]));
    return (people ?? []).filter((p) => p.active).map((p) => ({ id: p.id, name: p.full_name, pay: map.get(p.id) }));
  } });
}

function PayrollPage() {
  const { data: me } = useStaff();
  if (me && !me.canManageStaff) return <div className="p-8 text-muted-foreground">Only an Owner, Administrator or Manager can open payroll.</div>;
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold">Payroll</h1>
      <p className="text-muted-foreground">Fixed monthly salaries with PAYE, 3% AIDS levy and 4.5% NSSA worked out for you.</p>
      <Tabs defaultValue="run" className="mt-6">
        <TabsList><TabsTrigger value="run">Pay runs</TabsTrigger><TabsTrigger value="salaries">Salaries</TabsTrigger></TabsList>
        <TabsContent value="run"><PayRuns /></TabsContent>
        <TabsContent value="salaries"><Salaries /></TabsContent>
      </Tabs>
    </div>
  );
}

function Salaries() {
  const { data: staff = [] } = useStaffPay();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Record<string, { basic: string; allowances: string; nssa: boolean; paye: boolean }>>({});
  async function save(id: string) {
    const e = edit[id]; if (!e) return;
    const { error } = await supabase.from("staff_pay_profiles").upsert({ store_id: me_store(staff, id), user_id: id, basic_salary: Number(e.basic) || 0, allowances: Number(e.allowances) || 0, nssa_exempt: !e.nssa, paye_exempt: !e.paye, updated_at: new Date().toISOString() }, { onConflict: "store_id,user_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Salary saved"); setEdit(({ [id]: _, ...rest }) => rest); qc.invalidateQueries({ queryKey: ["payroll-staff"] });
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Basic salary (US$)</TableHead><TableHead>Allowances (US$)</TableHead><TableHead>NSSA</TableHead><TableHead>PAYE</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {staff.map((s) => {
            const e = edit[s.id] ?? { basic: String(s.pay?.basic_salary ?? 0), allowances: String(s.pay?.allowances ?? 0), nssa: !s.pay?.nssa_exempt, paye: !s.pay?.paye_exempt };
            const set = (p: Partial<typeof e>) => setEdit({ ...edit, [s.id]: { ...e, ...p } });
            return (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell><Input aria-label={`Basic salary for ${s.name}`} type="number" min="0" step="0.01" value={e.basic} onChange={(x) => set({ basic: x.target.value })} className="w-32" /></TableCell>
                <TableCell><Input aria-label={`Allowances for ${s.name}`} type="number" min="0" step="0.01" value={e.allowances} onChange={(x) => set({ allowances: x.target.value })} className="w-32" /></TableCell>
                <TableCell><Switch aria-label={`Deduct NSSA for ${s.name}`} checked={e.nssa} onCheckedChange={(v) => set({ nssa: v })} /></TableCell>
                <TableCell><Switch aria-label={`Deduct PAYE for ${s.name}`} checked={e.paye} onCheckedChange={(v) => set({ paye: v })} /></TableCell>
                <TableCell><Button size="sm" disabled={!edit[s.id]} onClick={() => save(s.id)}>Save</Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
// store_id defaults to the signed-in shop; the upsert key needs it, so reuse an existing row's value when present.
function me_store(staff: { id: string; pay?: { store_id: string } | undefined }[], id: string) {
  return staff.find((s) => s.id === id)?.pay?.store_id ?? staff.find((s) => s.pay)?.pay?.store_id ?? undefined as unknown as string;
}

function PayRuns() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: staff = [] } = useStaffPay();
  const [month, setMonth] = useState(thisMonth());
  const period = `${month}-01`;
  const { data: run } = useQuery({ queryKey: ["payroll-run", period], queryFn: async () => {
    const { data: r, error } = await supabase.from("payroll_runs").select("*").eq("period", period).maybeSingle();
    if (error) throw error; if (!r) return null;
    const { data: lines, error: e2 } = await supabase.from("payroll_lines").select("*").eq("run_id", r.id).order("name");
    if (e2) throw e2; return { ...r, lines: (lines ?? []) as Line[] };
  } });
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["payroll-run", period] });

  async function generate() {
    setBusy(true);
    try {
      let id = run?.id;
      if (!id) { const { data, error } = await supabase.from("payroll_runs").insert({ period }).select("id").single(); if (error) throw error; id = data.id; }
      const lines = staff.filter((s) => s.pay && Number(s.pay.basic_salary) + Number(s.pay.allowances) > 0).map((s) => {
        const old = run?.lines.find((l) => l.user_id === s.id);
        const c = calcPay({ basic: Number(s.pay!.basic_salary), allowances: Number(s.pay!.allowances), bonus: old?.bonus ?? 0, advances: old?.advances ?? 0, nssaExempt: s.pay!.nssa_exempt, payeExempt: s.pay!.paye_exempt });
        return { run_id: id!, user_id: s.id, name: s.name, basic: Number(s.pay!.basic_salary), allowances: Number(s.pay!.allowances), bonus: old?.bonus ?? 0, ...c };
      });
      if (!lines.length) throw new Error("Set salaries on the Salaries tab first");
      await supabase.from("payroll_lines").delete().eq("run_id", id!);
      const { error } = await supabase.from("payroll_lines").insert(lines); if (error) throw error;
      toast.success("Pay run calculated"); refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function updateLine(l: Line, patch: { bonus?: number; advances?: number }) {
    const s = staff.find((x) => x.id === l.user_id);
    const c = calcPay({ basic: Number(l.basic), allowances: Number(l.allowances), bonus: patch.bonus ?? Number(l.bonus), advances: patch.advances ?? Number(l.advances), nssaExempt: s?.pay?.nssa_exempt ?? false, payeExempt: s?.pay?.paye_exempt ?? false });
    const { error } = await supabase.from("payroll_lines").update({ bonus: patch.bonus ?? Number(l.bonus), ...c }).eq("id", l.id!);
    if (error) toast.error(error.message); else refresh();
  }
  async function finalize() {
    if (!run || !confirm("Finalise this pay run? It will be locked and posted to your books.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("finalize_payroll_run", { p_run: run.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Pay run finalised (${data})`); refresh(); qc.invalidateQueries({ queryKey: ["gl-lines"] });
  }
  async function discard() {
    if (!run || !confirm("Delete this draft pay run?")) return;
    const { error } = await supabase.from("payroll_runs").delete().eq("id", run.id);
    if (error) toast.error(error.message); else refresh();
  }

  const lines = run?.lines ?? [];
  const sum = (k: keyof Line) => lines.reduce((a, l) => a + Number(l[k]), 0);
  const draft = run?.status === "draft";
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Month<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-44" /></label>
        {(!run || draft) && <Button onClick={generate} disabled={busy}>{run ? "Recalculate" : "Generate pay run"}</Button>}
        {draft && lines.length > 0 && <Button variant="secondary" onClick={finalize} disabled={busy}>Finalise & post</Button>}
        {draft && <Button variant="ghost" onClick={discard}>Delete draft</Button>}
        {run?.status === "finalized" && <span className="rounded-md bg-secondary px-3 py-2 text-sm">Finalised · journal {run.journal_number}</span>}
      </div>
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>{["Staff", "Basic", "Allowances", "Bonus", "Gross", "NSSA", "PAYE", "AIDS levy", "Advances", "Net pay", ""].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="tabular">{usd(l.basic)}</TableCell>
                  <TableCell className="tabular">{usd(l.allowances)}</TableCell>
                  <TableCell>{draft ? <Input aria-label={`Bonus for ${l.name}`} type="number" min="0" defaultValue={l.bonus} className="w-24" onBlur={(e) => Number(e.target.value) !== Number(l.bonus) && updateLine(l, { bonus: Number(e.target.value) || 0 })} /> : usd(l.bonus)}</TableCell>
                  <TableCell className="tabular">{usd(l.gross)}</TableCell>
                  <TableCell className="tabular">{usd(l.nssa_employee)}</TableCell>
                  <TableCell className="tabular">{usd(l.paye)}</TableCell>
                  <TableCell className="tabular">{usd(l.aids_levy)}</TableCell>
                  <TableCell>{draft ? <Input aria-label={`Advances for ${l.name}`} type="number" min="0" defaultValue={l.advances} className="w-24" onBlur={(e) => Number(e.target.value) !== Number(l.advances) && updateLine(l, { advances: Number(e.target.value) || 0 })} /> : usd(l.advances)}</TableCell>
                  <TableCell className="tabular font-semibold">{usd(l.net)}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => printSlip(l, month, settings?.business_name ?? "")}>Payslip</Button></TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold"><TableCell>Total</TableCell><TableCell /><TableCell /><TableCell /><TableCell>{usd(sum("gross"))}</TableCell><TableCell>{usd(sum("nssa_employee"))}</TableCell><TableCell>{usd(sum("paye"))}</TableCell><TableCell>{usd(sum("aids_levy"))}</TableCell><TableCell>{usd(sum("advances"))}</TableCell><TableCell>{usd(sum("net"))}</TableCell><TableCell /></TableRow>
            </TableBody>
          </Table>
          <p className="p-3 text-sm text-muted-foreground">Shop's NSSA share this month: {usd(sum("nssa_employer"))}. Advances include goods staff took on account.</p>
        </div>
      )}
    </div>
  );
}

function printSlip(l: Line, month: string, shop: string) {
  const w = window.open("", "_blank", "width=380,height=640"); if (!w) return;
  const row = (k: string, v: number) => `<tr><td>${k}</td><td style="text-align:right">${usd(v)}</td></tr>`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<html><head><title>Payslip</title><style>body{font-family:monospace;width:72mm;margin:4mm}table{width:100%}h3,p{text-align:center;margin:2px}</style></head><body>
  <h3>${esc(shop)}</h3><p>PAYSLIP ${month}</p><p>${esc(l.name)}</p><hr/><table>
  ${row("Basic salary", l.basic)}${row("Allowances", l.allowances)}${row("Bonus", l.bonus)}${row("Gross pay", l.gross)}</table><hr/><table>
  ${row("NSSA (4.5%)", l.nssa_employee)}${row("PAYE", l.paye)}${row("AIDS levy (3%)", l.aids_levy)}${row("Advances", l.advances)}</table><hr/><table>
  <tr><td><b>NET PAY</b></td><td style="text-align:right"><b>${usd(l.net)}</b></td></tr></table></body></html>`);
  w.document.close(); w.focus(); w.print();
}
