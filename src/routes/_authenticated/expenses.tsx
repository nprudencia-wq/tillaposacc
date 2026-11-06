import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, type Currency } from "@/lib/pos";
import { activeTypes, methodLabel, usePaymentTypes } from "@/lib/payment-types";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Tilla POS" }, { name: "description", content: "Post shop running costs so net profit is accurate." }, { property: "og:title", content: "Expenses — Tilla POS" }, { property: "og:description", content: "Post shop running costs so net profit is accurate." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ExpensesPage,
});

export const EXPENSE_CATEGORIES = ["Rent", "Salaries & wages", "Electricity", "Water", "Fuel & transport", "Internet & phone", "Repairs & maintenance", "Bank charges", "Licences & taxes", "Security", "Cleaning", "Marketing", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

function ExpensesPage() {
  const { data: me } = useStaff();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const allowed = me?.roles.some((r) => ["admin", "owner", "manager", "accountant"].includes(r));
  const [f, setF] = useState({ date: today(), category: "", description: "", amount: "", currency: "USD", method: "cash", reference: "" });
  const { data: types } = usePaymentTypes();
  const methods = activeTypes(types);
  const current = methods.some((t) => t.code === f.method) ? f.method : (methods[0]?.code ?? "cash");
  const [busy, setBusy] = useState(false);

  const { data: list } = useQuery({
    queryKey: ["expenses"],
    enabled: !!allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data;
    },
  });

  if (me && !allowed) return <div className="p-8 text-muted-foreground">Only the Owner, Manager or Accountant can post expenses.</div>;

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("post_expense", {
      p_date: f.date, p_category: f.category, p_description: f.description, p_amount: Number(f.amount),
      p_currency: f.currency, p_method: current, p_reference: f.reference,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense posted");
    setF({ ...f, description: "", amount: "", reference: "" });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
  }

  const monthStart = today().slice(0, 7);
  const thisMonth = (list ?? []).filter((x) => x.expense_date.startsWith(monthStart)).reduce((a, x) => a + Number(x.amount), 0);
  const zigPreview = f.currency === "ZiG" && Number(f.amount) > 0 && settings ? Number(f.amount) / settings.zig_rate : null;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Expenses</h1>
      <p className="text-muted-foreground">Running costs posted here are taken off gross profit in the Profit & loss report. This month: <span className="tabular font-semibold text-foreground">{money(thisMonth)}</span></p>

      <form onSubmit={post} className="mt-6 grid gap-4 rounded-xl border bg-card p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="ex-date">Date</Label><Input id="ex-date" type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} required /></div>
        <div><Label>Category</Label>
          <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
            <SelectTrigger aria-label="Expense category"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label htmlFor="ex-desc">Description</Label><Input id="ex-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. November shop rent" /></div>
        <div><Label htmlFor="ex-amt">Amount</Label>
          <div className="flex gap-2">
            <Input id="ex-amt" type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
            <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
              <SelectTrigger className="w-24" aria-label="Currency"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem><SelectItem value="ZAR">Rand</SelectItem></SelectContent>
            </Select>
          </div>
          {zigPreview !== null && <p className="mt-1 text-xs text-muted-foreground">≈ {money(zigPreview)} at {settings?.zig_rate} ZiG/USD</p>}
        </div>
        <div><Label>Paid by</Label>
          <Select value={current} onValueChange={(v) => setF({ ...f, method: v })}>
            <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
            <SelectContent>{methods.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label htmlFor="ex-ref">Receipt / reference</Label><Input id="ex-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
        <div className="flex items-end"><Button type="submit" className="w-full" disabled={busy || !f.category || !f.amount}>Post expense</Button></div>
      </form>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Paid by</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">USD</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(list ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No expenses posted yet.</TableCell></TableRow>}
            {(list ?? []).map((x) => (
              <TableRow key={x.id}>
                <TableCell className="tabular">{x.expense_date}</TableCell>
                <TableCell>{x.category}</TableCell>
                <TableCell>{x.description}{x.reference && <span className="ml-2 text-xs text-muted-foreground">#{x.reference}</span>}</TableCell>
                <TableCell>{methodLabel(x.method)}</TableCell>
                <TableCell className="tabular text-right">{money(Number(x.original_amount), x.currency as Currency)}</TableCell>
                <TableCell className="tabular text-right font-medium">{money(Number(x.amount))}</TableCell>
                <TableCell className="text-right">
                  {me?.isOwner && <Button variant="ghost" size="icon" aria-label={`Delete expense ${x.category} ${x.expense_date}`} onClick={() => remove(x.id)}><Trash2 className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
