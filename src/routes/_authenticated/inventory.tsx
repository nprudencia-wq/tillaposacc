import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, History, ArrowUpDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/pos";
import { catOptions } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Tilla POS" }, { name: "description", content: "Products and stock levels." }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { data: me } = useStaff();
  const can = !!me?.canManageStock;
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [history, setHistory] = useState<Product | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name)").order("name")).data ?? [],
  });

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return products.filter((p) =>
      (!lowOnly || Number(p.stock) <= Number(p.min_stock)) &&
      (!s || p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s) || p.barcode?.includes(s)));
  }, [products, q, lowOnly]);

  const valuation = products.filter((p) => p.active).reduce((s, p) => s + Number(p.stock) * Number(p.cost_price), 0);
  const retail = products.filter((p) => p.active).reduce((s, p) => s + Number(p.stock) * Number(p.selling_price), 0);
  const lowCount = products.filter((p) => p.active && Number(p.stock) <= Number(p.min_stock)).length;

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">{products.length} products</p>
        </div>
        {can && <Button onClick={() => setEdit({ active: true })}><Plus className="h-4 w-4" />Add product</Button>}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Stock value (cost)" value={money(valuation)} />
        <Stat label="Stock value (retail)" value={money(retail)} />
        <button onClick={() => setLowOnly(!lowOnly)} className="text-left">
          <Stat label={lowOnly ? "Showing low stock — tap to clear" : "Low-stock items"} value={String(lowCount)} warn={lowCount > 0} />
        </button>
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="mt-6 max-w-sm bg-card" />

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>SKU / Barcode</TableHead>
              <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const low = Number(p.stock) <= Number(p.min_stock);
              return (
                <TableRow key={p.id} className={!p.active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{p.name}{!p.active && <Badge variant="outline" className="ml-2">Inactive</Badge>}</TableCell>
                  <TableCell>{p.categories?.name ?? "—"}</TableCell>
                  <TableCell className="tabular text-xs text-muted-foreground">{p.sku}<br />{p.barcode}</TableCell>
                  <TableCell className="tabular text-right">{money(Number(p.cost_price))}</TableCell>
                  <TableCell className="tabular text-right">{money(Number(p.selling_price))}</TableCell>
                  <TableCell className="tabular text-right">
                    <span className={low ? "inline-flex items-center gap-1 font-semibold text-destructive" : ""}>
                      {low && <AlertTriangle className="h-3.5 w-3.5" />}{Number(p.stock)}
                    </span>
                    <div className="text-xs text-muted-foreground">min {Number(p.min_stock)}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="icon" variant="ghost" aria-label={`View stock history for ${p.name}`} onClick={() => setHistory(p)}><History className="h-4 w-4" /></Button>
                    {can && <Button size="icon" variant="ghost" aria-label={`Adjust stock for ${p.name}`} onClick={() => setAdjust(p)}><ArrowUpDown className="h-4 w-4" /></Button>}
                    {can && <Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEdit(p)}><Pencil className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!can && <p className="mt-3 text-sm text-muted-foreground">You can view stock. Only managers and stock controllers can change it.</p>}

      {edit && <ProductDialog p={edit} onClose={() => setEdit(null)} />}
      {adjust && <AdjustDialog p={adjust} onClose={() => setAdjust(null)} />}
      {history && <HistoryDialog p={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-soft ${warn ? "border-warning" : ""}`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ProductDialog({ p, onClose }: { p: Partial<Product>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Partial<Product>>(p);
  const isNew = !p.id;
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("*").order("name")).data ?? [] });
  const set = (k: keyof Product, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.name) { toast.error("Name is required"); return; }
    const payload = {
      name: f.name, sku: f.sku || null, barcode: f.barcode || null, description: f.description || null,
      category_id: f.category_id || null, image_url: f.image_url || null,
      cost_price: Number(f.cost_price || 0), selling_price: Number(f.selling_price || 0), wholesale_price: Number(f.wholesale_price || 0),
      min_stock: Number(f.min_stock || 0), max_stock: Number(f.max_stock || 0), active: f.active ?? true,
    };
    if (isNew) {
      const { data, error } = await supabase.from("products").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      const opening = Number(f.stock || 0);
      if (opening > 0) {
        const { error: e2 } = await supabase.rpc("adjust_stock", { p_product: data.id, p_qty: opening, p_type: "opening", p_note: "Opening stock" });
        if (e2) toast.error(e2.message);
      }
    } else {
      const { error } = await supabase.from("products").update(payload).eq("id", p.id!);
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    toast.success("Product saved");
    onClose();
  }

  const field = (k: keyof Product, label: string, type = "text") => (
    <div className="space-y-1.5"><Label>{label}</Label>
      <Input type={type} step="0.01" value={(f[k] as string | number | null) ?? ""} onChange={(e) => set(k, e.target.value)} /></div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "Add product" : "Edit product"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "Name")}</div>
          {field("sku", "SKU")}{field("barcode", "Barcode")}
          <div className="space-y-1.5"><Label>Category</Label>
            <Select value={f.category_id ?? ""} onValueChange={(v) => set("category_id", v)}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{catOptions(cats).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field("image_url", "Image link (optional)")}
          {field("cost_price", "Cost price (USD)", "number")}{field("selling_price", "Selling price (USD)", "number")}
          {field("wholesale_price", "Wholesale price (USD)", "number")}
          {isNew ? field("stock", "Opening stock", "number") : <div />}
          {field("min_stock", "Minimum stock", "number")}{field("max_stock", "Maximum stock", "number")}
          <div className="sm:col-span-2">{field("description", "Description")}</div>
          {!isNew && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={f.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Active (shown on till)
            </label>
          )}
        </div>
        <Button onClick={save} className="w-full">Save</Button>
      </DialogContent>
    </Dialog>
  );
}

const adjTypes = [
  { v: "purchase", l: "Goods received (+)", sign: 1 },
  { v: "adjustment", l: "Stocktake correction (±)", sign: 0 },
  { v: "return", l: "Customer return (+)", sign: 1 },
  { v: "damaged", l: "Damaged (−)", sign: -1 },
  { v: "expired", l: "Expired (−)", sign: -1 },
];

function AdjustDialog({ p, onClose }: { p: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState("purchase");
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");
  const sign = adjTypes.find((t) => t.v === type)!.sign;
  const delta = sign === 0 ? qty : sign * Math.abs(qty);

  async function save() {
    if (!qty) { toast.error("Enter a quantity"); return; }
    const { error } = await supabase.rpc("adjust_stock", { p_product: p.id, p_qty: delta, p_type: type, p_note: note });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["movements", p.id] });
    toast.success("Stock updated");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust stock · {p.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Current: <b className="tabular">{Number(p.stock)}</b> → New: <b className="tabular">{Number(p.stock) + delta}</b></p>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{adjTypes.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
        </Select>
        <div className="space-y-1.5"><Label>Quantity{sign === 0 && " (use minus to reduce)"}</Label><Input type="number" value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Delta delivery GRN 2231" /></div>
        <Button onClick={save}>Save adjustment</Button>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ p, onClose }: { p: Product; onClose: () => void }) {
  const { data = [] } = useQuery({
    queryKey: ["movements", p.id],
    queryFn: async () => (await supabase.from("stock_movements").select("*").eq("product_id", p.id).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Stock history · {p.name}</DialogTitle></DialogHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Ref / note</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize">{m.type}</Badge></TableCell>
                <TableCell className="text-xs">{m.reference ?? m.note}</TableCell>
                <TableCell className={`tabular text-right ${Number(m.quantity) < 0 ? "text-destructive" : "text-success"}`}>{Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity)}</TableCell>
                <TableCell className="tabular text-right">{Number(m.balance_after)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
