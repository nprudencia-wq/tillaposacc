import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money } from "@/lib/pos";
import { ageDebt, type Aging } from "@/lib/customers";
import { activeTypes, methodLabel, usePaymentTypes } from "@/lib/payment-types";
import { CustomerDialog, useCustomers, type Customer } from "@/components/Customers";
import { exportExcel, exportPDF, type Col } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers & debtors — Tilla POS" }, { name: "description", content: "Customer accounts, credit sales, debt payments and aging reports." }] }),
  component: CustomersPage,
});

type Entry = { date: string; kind: "sale" | "payment" | "refund" | "adjustment"; ref: string; debit: number; credit: number; note: string };

function useLedger() {
  return useQuery({
    queryKey: ["customer-ledger"],
    queryFn: async () => {
      const { data: types } = await supabase.from("payment_types").select("code").eq("is_account", true);
      const codes = (types ?? []).map((t) => t.code);
      const [sp, pays, refs, adjs] = await Promise.all([
        codes.length ? supabase.from("sale_payments").select("amount, currency, method, sales!inner(customer_id, created_at, exchange_rate, sale_number)").in("method", codes).not("sales.customer_id", "is", null) : Promise.resolve({ data: [] as never[] }),
        supabase.from("customer_payments").select("*").order("created_at"),
        codes.length ? supabase.from("refunds").select("amount, created_at, method, reason, sales!inner(customer_id, sale_number)").in("method", codes) : Promise.resolve({ data: [] as never[] }),
        supabase.from("customer_adjustments").select("*").order("created_at"),
      ]);
      const entries: Record<string, Entry[]> = {};
      const push = (id: string, e: Entry) => (entries[id] ??= []).push(e);
      for (const p of (sp.data ?? []) as { amount: number; currency: string; sales: { customer_id: string; created_at: string; exchange_rate: number; sale_number: string } }[]) {
        const usd = p.currency === "ZiG" ? Number(p.amount) / Number(p.sales.exchange_rate) : Number(p.amount);
        push(p.sales.customer_id, { date: p.sales.created_at, kind: "sale", ref: p.sales.sale_number, debit: Math.round(usd * 100) / 100, credit: 0, note: "Sale on account" });
      }
      for (const p of pays.data ?? []) {
        push(p.customer_id, { date: p.created_at, kind: "payment", ref: p.payment_number, debit: 0, credit: Number(p.amount), note: `Paid by ${methodLabel(p.method)}${p.currency === "ZiG" ? ` (ZiG ${Number(p.original_amount).toFixed(2)})` : ""}${p.reference ? ` · ${p.reference}` : ""}` });
      }
      for (const r of (refs.data ?? []) as { amount: number; created_at: string; reason: string; sales: { customer_id: string; sale_number: string } }[]) {
        push(r.sales.customer_id, { date: r.created_at, kind: "refund", ref: r.sales.sale_number, debit: 0, credit: Number(r.amount), note: `Return: ${r.reason}` });
      }
      for (const a of adjs.data ?? []) {
        push(a.customer_id, {
          date: a.created_at,
          kind: "adjustment",
          ref: "ADJ",
          debit: a.kind === "charge" ? Number(a.amount) : 0,
          credit: a.kind === "credit" ? Number(a.amount) : 0,
          note: `${a.kind === "charge" ? "Balance added" : "Balance reduced"}${a.note ? `: ${a.note}` : ""}`,
        });
      }
      for (const k in entries) entries[k]?.sort((a, b) => a.date.localeCompare(b.date));
      return { entries, payments: pays.data ?? [] };
    },
  });
}

function agingFor(list: Entry[] = []): Aging {
  const charges = list.filter((e) => e.debit > 0).map((e) => ({ date: e.date, amount: e.debit }));
  const credits = list.reduce((s, e) => s + e.credit, 0);
  return ageDebt(charges, credits);
}

function CustomersPage() {
  const { data: me } = useStaff();
  const { data: customers = [] } = useCustomers();
  const { data: ledger } = useLedger();
  const { data: settings } = useSettings();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Customer | "new" | null>(null);
  const [open, setOpen] = useState<Customer | null>(null);
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [adjustFor, setAdjustFor] = useState<Customer | null>(null);

  const rows = useMemo(() => customers.map((c) => ({ c, a: agingFor(ledger?.entries[c.id]) })), [customers, ledger]);
  const shown = rows.filter(({ c }) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone?.includes(q));
  const totalDebt = rows.reduce((s, r) => s + r.a.total, 0);
  const debtors = rows.filter((r) => r.a.total > 0.004);
  const rate = settings?.zig_rate ?? 1;
  const biz = settings?.business_name ?? "";

  const agingCols: Col[] = [
    { key: "name", label: "Customer" }, { key: "phone", label: "Phone" },
    { key: "current", label: "Current", money: true }, { key: "d30", label: "1–30 days", money: true },
    { key: "d60", label: "31–60 days", money: true }, { key: "d90", label: "61–90 days", money: true },
    { key: "over90", label: "90+ days", money: true }, { key: "total", label: "Total owed", money: true },
  ];
  const agingRows = debtors.map(({ c, a }) => ({ name: c.name, phone: c.phone ?? "", ...a }));
  const sum = (k: keyof Aging) => debtors.reduce((s, r) => s + r.a[k], 0);

  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const byId = Object.fromEntries(customers.map((c) => [c.id, c]));
  const collections = (ledger?.payments ?? []).filter((p) => p.created_at.slice(0, 10) >= from && p.created_at.slice(0, 10) <= to).reverse();
  const collCols: Col[] = [{ key: "date", label: "Date" }, { key: "no", label: "Receipt" }, { key: "customer", label: "Customer" }, { key: "method", label: "Method" }, { key: "ref", label: "Reference" }, { key: "amount", label: "Amount (USD)", money: true }];
  const collRows = collections.map((p) => ({ date: new Date(p.created_at).toLocaleString(), no: p.payment_number, customer: byId[p.customer_id]?.name ?? "", method: methodLabel(p.method), ref: p.reference ?? "", amount: Number(p.amount) }));

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Customers & debtors</h1>
          <p className="text-muted-foreground">Total owed to you: <span className="tabular font-semibold text-foreground">{money(totalDebt)}</span> · {money(totalDebt * rate, "ZiG")} · {debtors.length} customers in debt</p>
        </div>
        <Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add customer</Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList><TabsTrigger value="list">Customers</TabsTrigger><TabsTrigger value="aging">Debt aging</TabsTrigger><TabsTrigger value="collections">Collections</TabsTrigger></TabsList>

        <TabsContent value="list" className="space-y-3">
          <Input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" aria-label="Search customers" />
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Credit limit</TableHead><TableHead className="text-right">Owes</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {shown.map(({ c, a }) => (
                  <TableRow key={c.id} className={c.active ? "" : "opacity-50"}>
                    <TableCell className="font-semibold">{c.name}{!c.active && " (off)"}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell className="tabular text-right">{c.credit_limit > 0 ? money(c.credit_limit) : "No limit"}</TableCell>
                    <TableCell className={`tabular text-right font-semibold ${a.total > 0 ? "text-destructive" : ""}`}>{money(a.total)}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpen(c)}>Statement</Button>
                      <Button size="sm" onClick={() => setPayFor(c)}>Receive payment</Button>
                      {me?.canManagePaymentTypes && <Button size="sm" variant="outline" onClick={() => setAdjustFor(c)}>Adjust balance</Button>}
                      {me?.canManagePaymentTypes && <Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edit</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!shown.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No customers yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="aging" className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportPDF("debt-aging", `${biz} — Debt aging`, `As at ${new Date().toLocaleDateString()}`, agingCols, agingRows)}><FileDown className="h-4 w-4" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportExcel("debt-aging", "Debt aging", agingCols, agingRows)}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow>{agingCols.map((c) => <TableHead key={c.key} className={c.money ? "text-right" : ""}>{c.label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {agingRows.map((r) => (
                  <TableRow key={r.name + r.phone}>
                    {agingCols.map((c) => <TableCell key={c.key} className={c.money ? "tabular text-right" : ""}>{c.money ? money(r[c.key as keyof Aging] as number) : r[c.key as "name"]}</TableCell>)}
                  </TableRow>
                ))}
                <TableRow className="font-bold">
                  <TableCell colSpan={2}>Total</TableCell>
                  {(["current", "d30", "d60", "d90", "over90", "total"] as const).map((k) => <TableCell key={k} className="tabular text-right">{money(sum(k))}</TableCell>)}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="collections" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div><Label htmlFor="col-from">From</Label><Input id="col-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label htmlFor="col-to">To</Label><Input id="col-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <Button variant="outline" size="sm" onClick={() => exportPDF("collections", `${biz} — Debt collections`, `${from} to ${to}`, collCols, collRows)}><FileDown className="h-4 w-4" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportExcel("collections", "Collections", collCols, collRows)}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            <span className="ml-auto font-semibold">Collected: <span className="tabular">{money(collRows.reduce((s, r) => s + r.amount, 0))}</span></span>
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow>{collCols.map((c) => <TableHead key={c.key} className={c.money ? "text-right" : ""}>{c.label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {collRows.map((r) => (
                  <TableRow key={r.no}><TableCell>{r.date}</TableCell><TableCell>{r.no}</TableCell><TableCell>{r.customer}</TableCell><TableCell>{r.method}</TableCell><TableCell>{r.ref}</TableCell><TableCell className="tabular text-right">{money(r.amount)}</TableCell></TableRow>
                ))}
                {!collRows.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No debt payments in these dates.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {edit && <CustomerDialog customer={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {payFor && <PayDialog customer={payFor} owed={agingFor(ledger?.entries[payFor.id]).total} onClose={() => setPayFor(null)} />}
      {open && <StatementDialog customer={open} entries={ledger?.entries[open.id] ?? []} biz={biz} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PayDialog({ customer, owed, onClose }: { customer: Customer; owed: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: types } = usePaymentTypes();
  const methods = activeTypes(types).filter((t) => !t.is_account);
  const [amount, setAmount] = useState(owed > 0 ? owed.toFixed(2) : "");
  const [currency, setCurrency] = useState("USD");
  const [method, setMethod] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const m = method || methods[0]?.code || "cash";
  async function pay() {
    setBusy(true);
    const { error } = await supabase.rpc("receive_customer_payment", { p_customer: customer.id, p_amount: Number(amount), p_currency: currency, p_method: m, p_reference: ref });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Payment from ${customer.name} recorded`);
    qc.invalidateQueries({ queryKey: ["customer-ledger"] });
    qc.invalidateQueries({ queryKey: ["open-shift"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Payment from {customer.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Owes {money(owed)}. Cash goes into your open shift's drawer.</p>
        <div className="flex gap-2">
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" className="tabular flex-1" />
          <Select value={currency} onValueChange={setCurrency}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem></SelectContent></Select>
        </div>
        <Select value={m} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{methods.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
        <Button onClick={pay} disabled={busy || !(Number(amount) > 0)}>Record payment</Button>
      </DialogContent>
    </Dialog>
  );
}

function StatementDialog({ customer, entries, biz, onClose }: { customer: Customer; entries: Entry[]; biz: string; onClose: () => void }) {
  let bal = 0;
  const rows = entries.map((e) => { bal = Math.round((bal + e.debit - e.credit) * 100) / 100; return { date: new Date(e.date).toLocaleDateString(), ref: e.ref, note: e.note, debit: e.debit, credit: e.credit, balance: bal }; });
  const cols: Col[] = [{ key: "date", label: "Date" }, { key: "ref", label: "Ref" }, { key: "note", label: "Details" }, { key: "debit", label: "Charged", money: true }, { key: "credit", label: "Paid", money: true }, { key: "balance", label: "Balance", money: true }];
  const a = agingFor(entries);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Statement — {customer.name}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="font-semibold">Owes {money(a.total)}</span>
          <span className="text-muted-foreground">Current {money(a.current)} · 1–30 {money(a.d30)} · 31–60 {money(a.d60)} · 61–90 {money(a.d90)} · 90+ {money(a.over90)}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => exportPDF(`statement-${customer.name}`, `${biz} — Statement for ${customer.name}`, `${customer.phone ?? ""}  Balance owed: $${a.total.toFixed(2)}`, cols, rows)}><FileDown className="h-4 w-4" />PDF</Button>
          <Button size="sm" variant="outline" onClick={() => exportExcel(`statement-${customer.name}`, "Statement", cols, rows)}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader><TableRow>{cols.map((c) => <TableHead key={c.key} className={c.money ? "text-right" : ""}>{c.label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}><TableCell>{r.date}</TableCell><TableCell>{r.ref}</TableCell><TableCell>{r.note}</TableCell>
                  <TableCell className="tabular text-right">{r.debit ? money(r.debit) : ""}</TableCell><TableCell className="tabular text-right">{r.credit ? money(r.credit) : ""}</TableCell><TableCell className="tabular text-right font-semibold">{money(r.balance)}</TableCell></TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Nothing on account yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
