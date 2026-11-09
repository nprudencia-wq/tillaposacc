import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, PackagePlus, Wallet, Trash2, FileText, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { blankReceivingLine, completeReceivingLine, updateReceivingLine, receivingTotal, invoiceUSD, invoiceMoney, suggestedReceivingCost, repriceReceivingLines, type InvoiceCurrency, type ReceivingLine } from "@/lib/receiving";
import type { Database } from "@/integrations/supabase/types";
import { useStaff, useSettings } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/pos";
import { activeTypes, usePaymentTypes } from "@/lib/payment-types";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — Tilla POS" }, { name: "description", content: "Suppliers, goods received and balances owed." }, { property: "og:title", content: "Suppliers — Tilla POS" }, { property: "og:description", content: "Suppliers, goods received and balances owed." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SuppliersPage,
});

type GrnDraft = Database["public"]["Tables"]["grn_drafts"]["Row"];

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

function useSupplierData() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const [{ data: sup }, { data: grns }, { data: pays }, { data: rets }] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("grns").select("*").order("created_at", { ascending: false }),
        supabase.from("supplier_payments").select("*").order("created_at", { ascending: false }),
        supabase.from("supplier_returns").select("supplier_id,total"),
      ]);
      return {
        suppliers: (sup ?? []).map((s) => {
          const bought = (grns ?? []).filter((g) => g.supplier_id === s.id).reduce((a, g) => a + Number(g.total), 0);
          const paid = (pays ?? []).filter((p) => p.supplier_id === s.id).reduce((a, p) => a + Number(p.amount), 0);
          const returned = (rets ?? []).filter((r) => r.supplier_id === s.id).reduce((a, r) => a + Number(r.total), 0);
          return { ...s, bought, paid, returned, balance: Math.round((bought - paid - returned) * 100) / 100 };
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
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null);
  const [grnOpen, setGrnOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<GrnDraft | null>(null);
  const { data: drafts = [], error: draftsError } = useQuery({
    queryKey: ["grn-drafts"], enabled: can,
    queryFn: async () => { const { data, error } = await supabase.from("grn_drafts").select("*").is("posted_grn_id", null).order("updated_at", { ascending: false }); if (error) throw error; return data; },
  });
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
                  {can && <Button size="icon" variant="ghost" aria-label={`Edit supplier ${s.name}`} title="Edit supplier" onClick={() => setEditSupplier(s)}><Pencil className="h-4 w-4" /></Button>}
                  {can && <Button size="icon" variant="ghost" aria-label={`Delete supplier ${s.name}`} title="Delete supplier" onClick={() => setDeleteSupplier(s)}><Trash2 className="h-4 w-4" /></Button>}
                  <Button size="sm" variant="ghost" onClick={() => setStmtFor(s.id)}><FileText className="h-4 w-4" />Statement</Button>
                  {(can || me?.roles.includes("accountant")) && <Button size="sm" variant="ghost" onClick={() => setPayFor(s.id)}><Wallet className="h-4 w-4" />Pay</Button>}
                </TableCell>
              </TableRow>
            ))}
            {!data?.suppliers.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No suppliers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {can && <section className="mt-8">
        <h2 className="text-xl font-bold">Saved GRN drafts</h2>
        {draftsError && <p className="mt-2 text-destructive">Could not load drafts.</p>}
        <div className="mt-3 overflow-x-auto border rounded-md"><Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Supplier</TableHead><TableHead>Last saved</TableHead><TableHead /></TableRow></TableHeader><TableBody>
          {drafts.map((draft) => { const payload = draft.payload as unknown as GrnForm; return <TableRow key={draft.id}><TableCell>{payload.invoice || "Unfinished GRN"}</TableCell><TableCell>{name(payload.supplier)}</TableCell><TableCell>{new Date(draft.updated_at).toLocaleString()}</TableCell><TableCell><Button variant="outline" size="sm" onClick={() => { setEditingDraft(draft); setGrnOpen(true); }}><Pencil className="h-4 w-4" />Edit draft</Button></TableCell></TableRow>; })}
          {!drafts.length && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No unfinished GRNs.</TableCell></TableRow>}
        </TableBody></Table></div>
      </section>}
      <h2 className="mt-10 text-xl font-bold">Goods received</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader><TableRow><TableHead>GRN</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead className="text-right">Invoice total</TableHead><TableHead className="text-right">Total (USD)</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.grns ?? []).slice(0, 50).map((g) => (
              <TableRow key={g.id}>
                <TableCell className="tabular font-medium">{g.grn_number}</TableCell>
                <TableCell className="text-sm">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{name(g.supplier_id)}</TableCell>
                <TableCell>{g.invoice_number ?? "—"}</TableCell>
                <TableCell className="tabular text-right">{invoiceMoney(Number(g.original_total), g.currency as InvoiceCurrency)}</TableCell><TableCell className="tabular text-right">{money(Number(g.total))}</TableCell>
              </TableRow>
            ))}
            {!data?.grns.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No deliveries recorded.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {newOpen && <SupplierForm onClose={() => setNewOpen(false)} />}
      {editSupplier && <SupplierForm supplier={editSupplier} onClose={() => setEditSupplier(null)} />}
      {deleteSupplier && <DeleteSupplier supplier={deleteSupplier} onClose={() => setDeleteSupplier(null)} />}
      {grnOpen && <ReceiveGoods draft={editingDraft} suppliers={data?.suppliers ?? []} onClose={() => { setGrnOpen(false); setEditingDraft(null); }} />}
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

function SupplierForm({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: supplier?.name ?? "", contact_person: supplier?.contact_person ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "", address: supplier?.address ?? "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    if (!f.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    const payload = { ...f, name: f.name.trim() };
    const { error } = supplier ? await supabase.from("suppliers").update(payload).eq("id", supplier.id) : await supabase.from("suppliers").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    toast.success(supplier ? "Supplier updated" : "Supplier added");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{supplier ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
        {(["name", "contact_person", "phone", "email", "address"] as const).map((k) => (
          <div key={k} className="space-y-1.5"><Label htmlFor={`supplier-${k}`} className="capitalize">{k.replace("_", " ")}</Label><Input id={`supplier-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save supplier"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSupplier({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_supplier", { p_id: supplier.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["suppliers"] });
    toast.success("Supplier deleted");
    onClose();
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Delete {supplier.name}?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Suppliers with deliveries, payments or returns cannot be deleted.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete supplier"}</Button></div></DialogContent></Dialog>;
}

type GrnForm = { supplier: string; invoice: string; currency: InvoiceCurrency; rate: string; paid: string; note: string; method: string; lines: ReceivingLine[] };
export function ReceiveGoods({ suppliers, onClose, draft }: { suppliers: { id: string; name: string }[]; onClose: () => void; draft: GrnDraft | null }) {
  const initial = draft?.payload as unknown as GrnForm | undefined;
  const [savedDraft, setSavedDraft] = useState<GrnDraft | null>(draft);
  const [review, setReview] = useState(false);
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: products = [] } = useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name)").eq("active", true).order("name")).data ?? [],
  });
  const [supplier, setSupplier] = useState(initial?.supplier ?? suppliers[0]?.id ?? "");
  const [invoice, setInvoice] = useState(initial?.invoice ?? "");
  const [currency, setCurrency] = useState<InvoiceCurrency>(initial?.currency ?? "USD");
  const [rate, setRate] = useState(initial?.rate ?? "1");
  const [paid, setPaid] = useState(initial?.paid ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [method, setMethod] = useState(initial?.method ?? "");
  const { data: types } = usePaymentTypes();
  const methods = activeTypes(types).filter((type) => !type.is_account);
  const currentMethod = methods.some((type) => type.code === method) ? method : methods[0]?.code ?? "";
  const [lines, setLines] = useState<ReceivingLine[]>(initial?.lines ?? [blankReceivingLine()]);
  const [busy, setBusy] = useState(false);
  const total = receivingTotal(lines);
  const usdTotal = Number(rate) > 0 ? invoiceUSD(total, currency, Number(rate)) : null;
  const upd = (index: number, patch: Partial<ReceivingLine>) => setLines((previous) => updateReceivingLine(previous, index, patch));
  const productCost = (id: string) => Number(products.find((product) => product.id === id)?.cost_price ?? 0);
  function pickProduct(index: number, productId: string) {
    setLines((previous) => updateReceivingLine(previous, index, {
      product_id: productId,
      unit_cost: suggestedReceivingCost(productId, previous.filter((_, i) => i !== index), productCost(productId), Number(rate)),
    }));
  }
  function changeRate(value: string) {
    setLines((previous) => repriceReceivingLines(previous, Number(rate), Number(value), productCost));
    setRate(value);
  }
  function changeCurrency(value: InvoiceCurrency) {
    const nextRate = value === "USD" ? 1 : value === "ZiG" ? settings?.zig_rate ?? 0 : settings?.rand_rate ?? 0;
    changeRate(nextRate > 0 ? String(nextRate) : "");
    setCurrency(value);
  }

  const entered = lines.filter((line) => line.product_id || line.quantity || line.unit_cost);
  function validate() {
    if (!supplier || !entered.length || entered.some((line) => !completeReceivingLine(line))) return "Choose a supplier and complete every entered line";
    if (!Number.isFinite(Number(rate)) || Number(rate) <= 0) return "Enter a positive exchange rate";
    if (!Number.isFinite(Number(paid)) || Number(paid) < 0 || Number(paid) > total) return "Paid now must be between zero and the total";
    if (Number(paid) > 0 && !currentMethod) return "Choose a payment type";
    return null;
  }
  async function persist() {
    const payload: GrnForm = { supplier, invoice, currency, rate, paid, note, method: currentMethod, lines };
    const { data, error } = await supabase.rpc("save_grn_draft", { p_id: savedDraft?.id ?? crypto.randomUUID(), p_version: savedDraft?.version ?? 0, p_payload: payload as unknown as Database["public"]["Tables"]["grn_drafts"]["Row"]["payload"] });
    if (error) throw error;
    if (!data) throw new Error("Draft could not be saved");
    setSavedDraft(data);
    await qc.invalidateQueries({ queryKey: ["grn-drafts"] });
    return data;
  }
  async function saveTemporary() {
    if (busy) return;
    setBusy(true);
    try {
      await persist();
      window.__lovableEvents?.track?.("project.grn_draft_saved", { currency, line_count: entered.length });
      toast.success("GRN draft saved — inventory unchanged"); onClose();
    }
    catch (error) { toast.error((error as { message?: string }).message ?? "Could not save draft"); }
    finally { setBusy(false); }
  }
  async function save() {
    if (busy || !review) return;
    const invalid = validate(); if (invalid) { toast.error(invalid); return; }
    setBusy(true);
    try {
      const d = await persist();
      window.__lovableEvents?.track?.("project.grn_review_confirmed", { currency, line_count: entered.length });
      const { data, error } = await supabase.rpc("post_grn_draft", { p_id: d.id, p_version: d.version });
      if (error) throw error;
      window.__lovableEvents?.track?.("project.grn_inventory_posted", { currency, line_count: entered.length });
      await Promise.all(["grn-drafts", "goods-received", "reports", "suppliers", "products", "movements", "gl-lines", "branch_stock", "activity"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      toast.success(`${(data as { grn_number: string }).grn_number} received — stock updated`);
      onClose();
    } catch (error) { toast.error((error as { message?: string }).message ?? "Receive goods failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{review ? "Review goods received" : savedDraft ? "Edit GRN draft" : "Receive goods (GRN)"}</DialogTitle></DialogHeader>
        {review ? <>
          <div className="grid gap-2 text-sm sm:grid-cols-2"><div>Supplier: <b>{suppliers.find((s) => s.id === supplier)?.name}</b></div><div>Invoice: <b>{invoice || "—"}</b></div><div>Currency: <b>{currency}</b> · Rate: {rate} per USD</div><div>Paid now: <b>{invoiceMoney(Number(paid), currency)}</b></div></div>
          <div className="overflow-x-auto border rounded-md"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Received quantity</TableHead><TableHead>Unit cost</TableHead><TableHead>Total cost</TableHead></TableRow></TableHeader><TableBody>{entered.map((line, i) => <TableRow key={i}><TableCell>{products.find((p) => p.id === line.product_id)?.name}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{invoiceMoney(Number(line.unit_cost), currency)}</TableCell><TableCell>{invoiceMoney(Number(line.quantity) * Number(line.unit_cost), currency)}</TableCell></TableRow>)}</TableBody></Table></div>
          <div className="grid gap-3 border-y py-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Total quantity</p><b>{entered.reduce((sum, l) => sum + Number(l.quantity), 0).toLocaleString()}</b></div><div><p className="text-sm text-muted-foreground">Total cost</p><b>{invoiceMoney(total, currency)}</b></div><div><p className="text-sm text-muted-foreground">USD cost</p><b>{money(usdTotal ?? 0)}</b></div></div>
          <p className="text-sm text-muted-foreground">Inventory has not been updated yet.</p>
          <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReview(false)}>Back to edit</Button><Button variant="outline" disabled={busy} onClick={saveTemporary}>Save draft</Button><Button disabled={busy} onClick={save}>{busy ? "Receiving…" : "Confirm & update inventory"}</Button></div>
        </> : <>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Supplier</Label><Select value={supplier} onValueChange={setSupplier}><SelectTrigger aria-label="Supplier"><SelectValue /></SelectTrigger><SelectContent>{suppliers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="grn-invoice">Supplier invoice number</Label><Input id="grn-invoice" value={invoice} onChange={(event) => setInvoice(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Invoice currency</Label><Select value={currency} onValueChange={(value) => changeCurrency(value as InvoiceCurrency)}><SelectTrigger aria-label="Invoice currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem><SelectItem value="ZAR">Rand (ZAR)</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="grn-rate">{currency === "USD" ? "Exchange rate" : `${currency === "ZAR" ? "Rand" : "ZiG"} per US$1`}</Label><Input id="grn-rate" type="number" min="0.000001" step="0.000001" disabled={currency === "USD"} value={rate} onChange={(event) => changeRate(event.target.value)} /></div>
        </div>
        <div className="overflow-x-auto border rounded-md"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Quantity</TableHead><TableHead>Unit cost ({currency === "ZAR" ? "Rand" : currency})</TableHead><TableHead className="text-right">Line total</TableHead><TableHead /></TableRow></TableHeader><TableBody>
          {lines.map((line, index) => <TableRow key={index}>
            <TableCell className="min-w-48"><Select value={line.product_id} onValueChange={(value) => pickProduct(index, value)}><SelectTrigger aria-label={`Product line ${index + 1}`}><SelectValue placeholder="Product" /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {product.sku}</SelectItem>)}</SelectContent></Select></TableCell>
            <TableCell><Input aria-label={`Quantity line ${index + 1}`} type="number" min="0.001" step="0.001" className="w-24" value={line.quantity} onChange={(event) => upd(index, { quantity: event.target.value })} /></TableCell>
            <TableCell><Input aria-label={`Unit cost line ${index + 1}`} type="number" min="0" step="0.01" className="w-28" value={line.unit_cost} onChange={(event) => upd(index, { unit_cost: event.target.value })} /></TableCell>
            <TableCell className="tabular text-right whitespace-nowrap">{completeReceivingLine(line) ? invoiceMoney(Number(line.quantity) * Number(line.unit_cost), currency) : "—"}</TableCell>
            <TableCell><Button size="icon" variant="ghost" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((previous) => { const next = previous.filter((_, i) => i !== index); const last = next.at(-1); return !last || completeReceivingLine(last) ? [...next, blankReceivingLine()] : next; })}><Trash2 className="h-4 w-4" /></Button></TableCell>
          </TableRow>)}
        </TableBody></Table></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="grn-paid">Paid now ({currency === "ZAR" ? "Rand" : currency})</Label><Input id="grn-paid" type="number" min="0" step="0.01" value={paid} onChange={(event) => setPaid(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Payment type</Label><Select value={currentMethod} onValueChange={setMethod}><SelectTrigger aria-label="Payment type"><SelectValue placeholder="Choose payment type" /></SelectTrigger><SelectContent>{methods.map((type) => <SelectItem key={type.code} value={type.code}>{type.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="grn-note">Note</Label><Input id="grn-note" value={note} onChange={(event) => setNote(event.target.value)} /></div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><div><div className="text-sm text-muted-foreground">Invoice total</div><div className="tabular text-2xl font-bold">{invoiceMoney(total, currency)}</div>{currency !== "USD" && <div className="text-sm text-muted-foreground">USD equivalent: {usdTotal === null ? "—" : money(usdTotal)}</div>}</div><div className="flex items-center gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="outline" disabled={busy} onClick={saveTemporary}>{busy ? "Saving…" : "Save draft"}</Button><Button onClick={() => { const invalid = validate(); if (invalid) toast.error(invalid); else setReview(true); }} disabled={busy}>Review GRN</Button></div></div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function PaySupplier({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const { data: types } = usePaymentTypes();
  const methods = activeTypes(types);
  const current = methods.some((t) => t.code === method) ? method : (methods[0]?.code ?? "cash");
  const [ref, setRef] = useState("");
  async function save() {
    const { error } = await supabase.rpc("pay_supplier", { p_supplier: id, p_amount: amount, p_method: current, p_reference: ref });
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
        <Select value={current} onValueChange={setMethod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{methods.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="space-y-1.5"><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        <Button onClick={save}>Record payment</Button>
      </DialogContent>
    </Dialog>
  );
}
