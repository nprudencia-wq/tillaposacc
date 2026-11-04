import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, PackagePlus, Wallet, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, methodLabels } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — Tilla POS" }, { name: "description", content: "Suppliers, goods received and balances owed." }] }),
  component: SuppliersPage,
});

function useSupplierData() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const [{ data: sup }, { data: grns }, { data: pays }] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("grns").select("*").order("created_at", { ascending: false }),
        supabase.from("supplier_payments").select("*").order("created_at", { ascending: false }),
      ]);
      return {
        suppliers: (sup ?? []).map((s) => {
          const bought = (grns ?? []).filter((g) => g.supplier_id === s.id).reduce((a, g) => a + Number(g.total), 0);
          const paid = (pays ?? []).filter((p) => p.supplier_id === s.id).reduce((a, p) => a + Number(p.amount), 0);
          return { ...s, bought, paid, balance: Math.round((bought - paid) * 100) / 100 };
        }),
        grns: grns ?? [],
        pays: pays ?? [],
      };
    },
  });
}

function SuppliersPage() {
  const { data: me } = useStaff();
  const can = !!me?.canManageStock;
  const { data } = useSupplierData();
  const [newOpen, setNewOpen] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [stmtFor, setStmtFor] = useState<string | null>(null);
  const name = (id: string) => data?.suppliers.find((s) => s.id === id)?.name ?? "";
  const owed = (data?.suppliers ?? []).reduce((a, s) => a + Math.max(0, s.balance), 0);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground">Total owed to suppliers: <b className="tabular text-foreground">{money(owed)}</b></p>
        </div>
        {can && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" />New supplier</Button>
            <Button onClick={() => setGrnOpen(true)} disabled={!data?.suppliers.length}><PackagePlus className="h-4 w-4" />Receive goods</Button>
          </div>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Purchased</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(data?.suppliers ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{[s.contact_person, s.phone].filter(Boolean).join(" · ")}</TableCell>
                <TableCell className="tabular text-right">{money(s.bought)}</TableCell>
                <TableCell className="tabular text-right">{money(s.paid)}</TableCell>
                <TableCell className={`tabular text-right font-semibold ${s.balance > 0 ? "text-destructive" : ""}`}>{money(s.balance)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => setStmtFor(s.id)}><FileText className="h-4 w-4" />Statement</Button>
                  {(can || me?.roles.includes("accountant")) && <Button size="sm" variant="ghost" onClick={() => setPayFor(s.id)}><Wallet className="h-4 w-4" />Pay</Button>}
                </TableCell>
              </TableRow>
            ))}
            {!data?.suppliers.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No suppliers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-10 text-xl font-bold">Goods received</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead>GRN</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.grns ?? []).slice(0, 50).map((g) => (
              <TableRow key={g.id}>
                <TableCell className="tabular font-medium">{g.grn_number}</TableCell>
                <TableCell className="text-sm">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{name(g.supplier_id)}</TableCell>
                <TableCell>{g.invoice_number ?? "—"}</TableCell>
                <TableCell className="tabular text-right">{money(Number(g.total))}</TableCell>
              </TableRow>
            ))}
            {!data?.grns.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No deliveries recorded.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {newOpen && <NewSupplier onClose={() => setNewOpen(false)} />}
      {grnOpen && <ReceiveGoods suppliers={data?.suppliers ?? []} onClose={() => setGrnOpen(false)} />}
      {payFor && <PaySupplier id={payFor} name={name(payFor)} onClose={() => setPayFor(null)} />}
      {stmtFor && data && (
        <Dialog open onOpenChange={(o) => !o && setStmtFor(null)}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>Statement · {name(stmtFor)}</DialogTitle></DialogHeader>
            <Statement grns={data.grns.filter((g) => g.supplier_id === stmtFor)} pays={data.pays.filter((p) => p.supplier_id === stmtFor)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Statement({ grns, pays }: { grns: { created_at: string; grn_number: string; total: number }[]; pays: { created_at: string; reference: string | null; amount: number; method: string }[] }) {
  const lines = [
    ...grns.map((g) => ({ d: g.created_at, ref: g.grn_number, debit: Number(g.total), credit: 0 })),
    ...pays.map((p) => ({ d: p.created_at, ref: `Payment ${p.reference ?? ""}`, debit: 0, credit: Number(p.amount) })),
  ].sort((a, b) => a.d.localeCompare(b.d));
  let bal = 0;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Purchases</TableHead><TableHead className="text-right">Payments</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
      <TableBody>
        {lines.map((l, i) => {
          bal += l.debit - l.credit;
          return (
            <TableRow key={i}>
              <TableCell className="text-xs">{new Date(l.d).toLocaleDateString()}</TableCell>
              <TableCell className="text-sm">{l.ref}</TableCell>
              <TableCell className="tabular text-right">{l.debit ? money(l.debit) : ""}</TableCell>
              <TableCell className="tabular text-right">{l.credit ? money(l.credit) : ""}</TableCell>
              <TableCell className="tabular text-right font-semibold">{money(bal)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function NewSupplier({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", contact_person: "", phone: "", email: "", address: "" });
  async function save() {
    if (!f.name) { toast.error("Name is required"); return; }
    const { error } = await supabase.from("suppliers").insert(f);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    toast.success("Supplier added");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
        {(["name", "contact_person", "phone", "email", "address"] as const).map((k) => (
          <div key={k} className="space-y-1.5"><Label className="capitalize">{k.replace("_", " ")}</Label><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <Button onClick={save}>Save supplier</Button>
      </DialogContent>
    </Dialog>
  );
}

type GrnLine = { product_id: string; quantity: number; unit_cost: number };

function ReceiveGoods({ suppliers, onClose }: { suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name)").eq("active", true).order("name")).data ?? [],
  });
  const [supplier, setSupplier] = useState(suppliers[0]?.id ?? "");
  const [invoice, setInvoice] = useState("");
  const [paid, setPaid] = useState(0);
  const [lines, setLines] = useState<GrnLine[]>([]);
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0);
  const upd = (i: number, p: Partial<GrnLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));

  async function save() {
    if (!supplier || !lines.length || lines.some((l) => !l.product_id || l.quantity <= 0)) { toast.error("Choose a supplier and complete every line"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("receive_goods", { p_supplier: supplier, p_invoice: invoice, p_items: lines as never, p_paid: paid, p_note: "" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    toast.success(`${(data as { grn_number: string }).grn_number} received — stock updated`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Receive goods (GRN)</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Supplier</Label>
            <Select value={supplier} onValueChange={setSupplier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Supplier invoice number</Label><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Select value={l.product_id} onValueChange={(v) => upd(i, { product_id: v, unit_cost: Number(products.find((p) => p.id === v)?.cost_price ?? 0) })}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" className="w-24" placeholder="Qty" value={l.quantity || ""} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} />
              <Input type="number" step="0.01" className="w-28" placeholder="Unit cost" value={l.unit_cost || ""} onChange={(e) => upd(i, { unit_cost: Number(e.target.value) })} />
              <Button size="icon" variant="ghost" aria-label={`Remove line ${i + 1} from this goods received note`} onClick={() => setLines(lines.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { product_id: "", quantity: 1, unit_cost: 0 }])}><Plus className="h-4 w-4" />Add line</Button>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-muted p-4">
          <div className="space-y-1.5"><Label>Paid now (USD, leave 0 for credit)</Label><Input type="number" step="0.01" value={paid || ""} onChange={(e) => setPaid(Number(e.target.value))} className="w-40" /></div>
          <div className="tabular font-display text-2xl font-bold">{money(total)}</div>
        </div>
        <Button onClick={save} disabled={busy}>Receive and add to stock</Button>
      </DialogContent>
    </Dialog>
  );
}

function PaySupplier({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  async function save() {
    const { error } = await supabase.rpc("pay_supplier", { p_supplier: id, p_amount: amount, p_method: method, p_reference: ref });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    toast.success("Payment recorded");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pay {name}</DialogTitle></DialogHeader>
        <div className="space-y-1.5"><Label>Amount (USD)</Label><Input type="number" step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(methodLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <div className="space-y-1.5"><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        <Button onClick={save}>Record payment</Button>
      </DialogContent>
    </Dialog>
  );
}
