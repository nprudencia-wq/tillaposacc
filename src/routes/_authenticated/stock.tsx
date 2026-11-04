import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Download, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/pos";
import { catOptions, reorderQty } from "@/lib/categories";
import { exportExcel, exportPDF } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/stock")({
  head: () => ({
    meta: [
      { title: "Stock control — Tilla POS" },
      { name: "description", content: "Reorders, write-offs, branch transfers, supplier returns and stocktakes." },
      { property: "og:title", content: "Stock control — Tilla POS" },
      { property: "og:description", content: "Reorders, write-offs, branch transfers, supplier returns and stocktakes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockPage,
});

type Line = { product_id: string; quantity: number };

function useProducts() {
  return useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name)").order("name")).data ?? [],
  });
}
function useBranches() {
  return useQuery({ queryKey: ["branches"], queryFn: async () => (await supabase.from("branches").select("*").order("is_main", { ascending: false }).order("name")).data ?? [] });
}
function useCats() {
  return useQuery({ queryKey: ["categories"], queryFn: async () => (await supabase.from("categories").select("*").order("name")).data ?? [] });
}

function StockPage() {
  const { data: me } = useStaff();
  const can = !!me?.canManageStock;
  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Stock control</h1>
      <p className="text-muted-foreground">Reorders, write-offs, transfers, supplier returns and stocktakes.</p>
      {!can && <p className="mt-3 text-sm text-muted-foreground">You can view stock. Only staff with the products & stock right can change it.</p>}
      <Tabs defaultValue="reorder" className="mt-6">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="reorder">Low stock & reorder</TabsTrigger>
          <TabsTrigger value="writeoff">Damaged & expired</TabsTrigger>
          <TabsTrigger value="transfer">Branch transfers</TabsTrigger>
          <TabsTrigger value="returns">Returns to suppliers</TabsTrigger>
          <TabsTrigger value="stocktake">Stocktake</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="movements">Movement history</TabsTrigger>
          <TabsTrigger value="setup">Branches & categories</TabsTrigger>
        </TabsList>
        <TabsContent value="reorder"><Reorder /></TabsContent>
        <TabsContent value="writeoff"><WriteOff can={can} /></TabsContent>
        <TabsContent value="transfer"><Transfers can={can} /></TabsContent>
        <TabsContent value="returns"><SupplierReturns can={can} /></TabsContent>
        <TabsContent value="stocktake"><Stocktake can={can} /></TabsContent>
        <TabsContent value="valuation"><Valuation /></TabsContent>
        <TabsContent value="movements"><Movements /></TabsContent>
        <TabsContent value="setup"><Setup can={can} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 overflow-x-auto rounded-xl border bg-card p-4 shadow-soft">{children}</div>;
}

/* ---------- product line picker ---------- */
function Lines({ lines, setLines, maxFor }: { lines: Line[]; setLines: (l: Line[]) => void; maxFor?: (id: string) => number }) {
  const { data: products = [] } = useProducts();
  const [pick, setPick] = useState("");
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? "";
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={pick} onValueChange={(v) => { if (!lines.some((l) => l.product_id === v)) setLines([...lines, { product_id: v, quantity: 1 }]); setPick(""); }}>
          <SelectTrigger className="max-w-md" aria-label="Add a product"><SelectValue placeholder="Add a product…" /></SelectTrigger>
          <SelectContent>{products.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {lines.map((l, i) => (
        <div key={l.product_id} className="flex items-center gap-2">
          <span className="flex-1 text-sm">{name(l.product_id)}{maxFor && <span className="ml-2 text-xs text-muted-foreground">available {maxFor(l.product_id)}</span>}</span>
          <Input type="number" aria-label={`Quantity of ${name(l.product_id)}`} className="w-28" value={l.quantity || ""} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
          <Button size="icon" variant="ghost" aria-label={`Remove ${name(l.product_id)}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
    </div>
  );
}

/* ---------- reorder ---------- */
function Reorder() {
  const { data: products = [] } = useProducts();
  const rows = products.filter((p) => p.active && Number(p.stock) <= Number(p.min_stock))
    .map((p) => ({ ...p, suggest: reorderQty(Number(p.stock), Number(p.min_stock), Number(p.max_stock)) }));
  const cost = rows.reduce((s, r) => s + r.suggest * Number(r.cost_price), 0);
  const cols = ["Product", "SKU", "Stock", "Min", "Max", "Reorder qty", "Est. cost"];
  const data = rows.map((r) => [r.name, r.sku ?? "", Number(r.stock), Number(r.min_stock), Number(r.max_stock), r.suggest, money(r.suggest * Number(r.cost_price))]);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">{rows.length > 0 && <AlertTriangle className="h-4 w-4 text-destructive" />}{rows.length} products at or below minimum · reorder cost about {money(cost)}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportPDF("Reorder list", cols, data, "reorder-list")}><Download className="h-4 w-4" />PDF</Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel("Reorder", cols, data, "reorder-list")}><Download className="h-4 w-4" />Excel</Button>
        </div>
      </div>
      <Table className="mt-3">
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.map((d, i) => <TableRow key={i}>{d.map((v, j) => <TableCell key={j} className={j > 1 ? "tabular" : ""}>{v}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </Card>
  );
}

/* ---------- write-offs ---------- */
function WriteOff({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [type, setType] = useState("damaged");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const loss = lines.reduce((s, l) => s + l.quantity * Number(products.find((p) => p.id === l.product_id)?.cost_price ?? 0), 0);
  const { data: recent = [] } = useQuery({
    queryKey: ["movements", "writeoffs"],
    queryFn: async () => (await supabase.from("stock_movements").select("*, products(name, cost_price)").in("type", ["damaged", "expired"]).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  async function save() {
    if (!lines.length || lines.some((l) => !(l.quantity > 0))) { toast.error("Add products with quantities above zero"); return; }
    for (const l of lines) {
      const { error } = await supabase.rpc("adjust_stock", { p_product: l.product_id, p_qty: -Math.abs(l.quantity), p_type: type, p_note: note || type });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`Written off · loss ${money(loss)}`);
    setLines([]); setNote("");
    qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["movements"] });
  }
  return (
    <>
      {can && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Reason</Label>
              <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="damaged">Damaged</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Note / batch number</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Batch 2231, crushed in delivery" /></div>
          </div>
          <div className="mt-3"><Lines lines={lines} setLines={setLines} /></div>
          <div className="mt-3 flex items-center justify-between"><span className="text-sm">Loss at cost: <b className="tabular">{money(loss)}</b></span><Button onClick={save}>Write off stock</Button></div>
        </Card>
      )}
      <Card>
        <p className="font-semibold">Recent write-offs</p>
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Reason</TableHead><TableHead>Note</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Loss</TableHead></TableRow></TableHeader>
          <TableBody>{recent.map((m) => (
            <TableRow key={m.id}><TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell><TableCell>{m.products?.name}</TableCell>
              <TableCell><Badge variant="secondary" className="capitalize">{m.type}</Badge></TableCell><TableCell className="text-xs">{m.note}</TableCell>
              <TableCell className="tabular text-right">{Number(m.quantity)}</TableCell><TableCell className="tabular text-right">{money(Math.abs(Number(m.quantity)) * Number(m.products?.cost_price ?? 0))}</TableCell></TableRow>
          ))}</TableBody></Table>
      </Card>
    </>
  );
}

/* ---------- transfers ---------- */
function Transfers({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();
  const { data: products = [] } = useProducts();
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [lines, setLines] = useState<Line[]>([]); const [note, setNote] = useState("");
  const { data: bstock = [] } = useQuery({ queryKey: ["branch_stock"], queryFn: async () => (await supabase.from("branch_stock").select("*")).data ?? [] });
  const { data: transfers = [] } = useQuery({ queryKey: ["transfers"], queryFn: async () => (await supabase.from("stock_transfers").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const bname = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";
  const avail = (pid: string) => {
    const b = branches.find((x) => x.id === from);
    if (!b) return 0;
    if (b.is_main) return Number(products.find((p) => p.id === pid)?.stock ?? 0);
    return Number(bstock.find((s) => s.branch_id === from && s.product_id === pid)?.quantity ?? 0);
  };
  async function save() {
    if (!from || !to) { toast.error("Choose both branches"); return; }
    const { data, error } = await supabase.rpc("transfer_stock", { p_from: from, p_to: to, p_items: lines, p_note: note });
    if (error) { toast.error(error.message); return; }
    toast.success(`Transfer ${data} recorded`);
    setLines([]); setNote("");
    ["products", "branch_stock", "transfers", "movements"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }
  const active = branches.filter((b) => b.active);
  return (
    <>
      {branches.length < 2 && <p className="mt-4 text-sm text-muted-foreground">Add a second branch under "Branches & categories" to move stock between shops.</p>}
      {can && branches.length >= 2 && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>From</Label><Select value={from} onValueChange={setFrom}><SelectTrigger><SelectValue placeholder="Sending branch" /></SelectTrigger><SelectContent>{active.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>To</Label><Select value={to} onValueChange={setTo}><SelectTrigger><SelectValue placeholder="Receiving branch" /></SelectTrigger><SelectContent>{active.filter((b) => b.id !== from).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <div className="mt-3"><Lines lines={lines} setLines={setLines} maxFor={from ? avail : undefined} /></div>
          <Button className="mt-3" onClick={save}>Transfer stock</Button>
        </Card>
      )}
      {branches.filter((b) => !b.is_main).map((b) => {
        const rows = bstock.filter((s) => s.branch_id === b.id && Number(s.quantity) !== 0);
        return (
          <Card key={b.id}>
            <p className="font-semibold">Stock at {b.name}</p>
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">No stock here yet.</p> :
              <Table><TableBody>{rows.map((s) => <TableRow key={s.product_id}><TableCell>{products.find((p) => p.id === s.product_id)?.name}</TableCell><TableCell className="tabular text-right">{Number(s.quantity)}</TableCell></TableRow>)}</TableBody></Table>}
          </Card>
        );
      })}
      <Card>
        <p className="font-semibold">Transfer history</p>
        <Table><TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Date</TableHead><TableHead>From → To</TableHead><TableHead>Items</TableHead></TableRow></TableHeader>
          <TableBody>{transfers.map((t) => (
            <TableRow key={t.id}><TableCell className="tabular">{t.transfer_number}</TableCell><TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
              <TableCell>{bname(t.from_branch)} → {bname(t.to_branch)}</TableCell>
              <TableCell className="text-xs">{(t.items as { name: string; quantity: number }[]).map((i) => `${i.quantity} × ${i.name}`).join(", ")}</TableCell></TableRow>
          ))}</TableBody></Table>
      </Card>
    </>
  );
}

/* ---------- supplier returns ---------- */
function SupplierReturns({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers", "list"], queryFn: async () => (await supabase.from("suppliers").select("id,name").order("name")).data ?? [] });
  const { data: returns = [] } = useQuery({ queryKey: ["supplier_returns"], queryFn: async () => (await supabase.from("supplier_returns").select("*, suppliers(name)").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const [sup, setSup] = useState(""); const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const credit = lines.reduce((s, l) => s + l.quantity * Number(products.find((p) => p.id === l.product_id)?.cost_price ?? 0), 0);
  async function save() {
    if (!sup) { toast.error("Choose a supplier"); return; }
    const { data, error } = await supabase.rpc("return_to_supplier", { p_supplier: sup, p_items: lines, p_reason: reason });
    if (error) { toast.error(error.message); return; }
    toast.success(`Return ${data} recorded · ${money(credit)} taken off what you owe`);
    setLines([]); setReason("");
    ["products", "supplier_returns", "suppliers", "movements"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }
  return (
    <>
      {can && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Supplier</Label><Select value={sup} onValueChange={setSup}><SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Faulty, wrong item, near expiry" /></div>
          </div>
          <div className="mt-3"><Lines lines={lines} setLines={setLines} maxFor={(id) => Number(products.find((p) => p.id === id)?.stock ?? 0)} /></div>
          <div className="mt-3 flex items-center justify-between"><span className="text-sm">Credit at cost: <b className="tabular">{money(credit)}</b></span><Button onClick={save}>Return to supplier</Button></div>
        </Card>
      )}
      <Card>
        <p className="font-semibold">Returns history</p>
        <Table><TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Reason</TableHead><TableHead>Items</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
          <TableBody>{returns.map((r) => (
            <TableRow key={r.id}><TableCell className="tabular">{r.return_number}</TableCell><TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell><TableCell>{r.suppliers?.name}</TableCell><TableCell className="text-xs">{r.reason}</TableCell>
              <TableCell className="text-xs">{(r.items as { name: string; quantity: number }[]).map((i) => `${i.quantity} × ${i.name}`).join(", ")}</TableCell><TableCell className="tabular text-right">{money(Number(r.total))}</TableCell></TableRow>
          ))}</TableBody></Table>
      </Card>
    </>
  );
}

/* ---------- stocktake ---------- */
function Stocktake({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { data: cats = [] } = useCats();
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const { data: takes = [] } = useQuery({ queryKey: ["stocktakes"], queryFn: async () => (await supabase.from("stocktakes").select("*, categories(name)").order("started_at", { ascending: false }).limit(50)).data ?? [] });
  const current = takes.find((t) => t.status === "counting");
  const viewing = open ?? current?.id ?? null;
  async function start() {
    const { data, error } = await supabase.rpc("start_stocktake", { p_category: cat === "all" ? null : cat, p_note: "" });
    if (error) { toast.error(error.message); return; }
    setOpen(data); qc.invalidateQueries({ queryKey: ["stocktakes"] });
  }
  return (
    <>
      {can && !current && (
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5"><Label>Count</Label>
              <Select value={cat} onValueChange={setCat}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Whole shop</SelectItem>{catOptions(cats).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={start}><Plus className="h-4 w-4" />Start stocktake</Button>
          </div>
        </Card>
      )}
      {viewing && <StocktakeSheet id={viewing} can={can} onDone={() => setOpen(null)} />}
      <Card>
        <p className="font-semibold">Past stocktakes</p>
        <Table><TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Started</TableHead><TableHead>Scope</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{takes.map((t) => (
            <TableRow key={t.id}><TableCell className="tabular">{t.stocktake_number}</TableCell><TableCell className="text-xs">{new Date(t.started_at).toLocaleString()}</TableCell>
              <TableCell>{t.categories?.name ?? "Whole shop"}</TableCell><TableCell><Badge variant={t.status === "counting" ? "default" : "secondary"} className="capitalize">{t.status}</Badge></TableCell>
              <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setOpen(t.id)}>View</Button></TableCell></TableRow>
          ))}</TableBody></Table>
      </Card>
    </>
  );
}

function StocktakeSheet({ id, can, onDone }: { id: string; can: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["stocktake", id],
    queryFn: async () => {
      const [{ data: t }, { data: items }] = await Promise.all([
        supabase.from("stocktakes").select("*").eq("id", id).single(),
        supabase.from("stocktake_items").select("*").eq("stocktake_id", id).order("name"),
      ]);
      return { t, items: items ?? [] };
    },
  });
  const items = data?.items ?? [];
  const counting = data?.t?.status === "counting" && can;
  const rows = useMemo(() => items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase())), [items, q]);
  const counted = items.filter((i) => i.counted_qty !== null);
  const varValue = counted.reduce((s, i) => s + (Number(i.counted_qty) - Number(i.system_qty)) * Number(i.unit_cost), 0);
  async function count(pid: string, v: string) {
    const { error } = await supabase.rpc("record_count", { p_stocktake: id, p_product: pid, p_qty: v === "" ? null : Number(v) } as never);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["stocktake", id] });
  }
  async function finish(apply: boolean) {
    if (apply && !confirm(`Update stock to the counted figures? Variance ${money(varValue)}. Uncounted items stay as they are.`)) return;
    const { error } = await supabase.rpc("finish_stocktake", { p_stocktake: id, p_apply: apply });
    if (error) { toast.error(error.message); return; }
    toast.success(apply ? "Stock updated to counted figures" : "Stocktake cancelled");
    ["stocktakes", "stocktake", "products", "movements"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    onDone();
  }
  const cols = ["Product", "System", "Counted", "Variance", "Value"];
  const exp = items.map((i) => [i.name, Number(i.system_qty), i.counted_qty ?? "", i.counted_qty === null ? "" : Number(i.counted_qty) - Number(i.system_qty), i.counted_qty === null ? "" : money((Number(i.counted_qty) - Number(i.system_qty)) * Number(i.unit_cost))]);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{data?.t?.stocktake_number} · {counted.length}/{items.length} counted · variance <span className={varValue < 0 ? "text-destructive" : "text-success"}>{money(varValue)}</span></p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportPDF(`Stocktake ${data?.t?.stocktake_number}`, cols, exp, "stocktake")}><Download className="h-4 w-4" />Count sheet PDF</Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel("Stocktake", cols, exp, "stocktake")}><Download className="h-4 w-4" />Excel</Button>
          {counting && <Button variant="outline" size="sm" onClick={() => finish(false)}>Cancel</Button>}
          {counting && <Button size="sm" onClick={() => finish(true)}>Approve & update stock</Button>}
        </div>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find product…" className="mt-3 max-w-sm" />
      <Table className="mt-2"><TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((i) => {
          const v = i.counted_qty === null ? null : Number(i.counted_qty) - Number(i.system_qty);
          return (
            <TableRow key={i.product_id}><TableCell>{i.name}</TableCell><TableCell className="tabular">{Number(i.system_qty)}</TableCell>
              <TableCell>{counting ? <Input type="number" aria-label={`Counted ${i.name}`} className="w-24" defaultValue={i.counted_qty ?? ""} onBlur={(e) => count(i.product_id, e.target.value)} /> : <span className="tabular">{i.counted_qty ?? "—"}</span>}</TableCell>
              <TableCell className={`tabular ${v && v < 0 ? "text-destructive" : v ? "text-success" : ""}`}>{v === null ? "—" : v > 0 ? `+${v}` : v}</TableCell>
              <TableCell className="tabular">{v === null ? "—" : money(v * Number(i.unit_cost))}</TableCell></TableRow>
          );
        })}</TableBody></Table>
    </Card>
  );
}

/* ---------- valuation ---------- */
function Valuation() {
  const { data: products = [] } = useProducts();
  const { data: cats = [] } = useCats();
  const act = products.filter((p) => p.active);
  const by = new Map<string, { cost: number; retail: number; wholesale: number; units: number }>();
  for (const p of act) {
    const k = p.categories?.name ?? "Uncategorised";
    const r = by.get(k) ?? { cost: 0, retail: 0, wholesale: 0, units: 0 };
    const s = Number(p.stock);
    r.cost += s * Number(p.cost_price); r.retail += s * Number(p.selling_price); r.wholesale += s * Number(p.wholesale_price); r.units += s;
    by.set(k, r);
  }
  const cols = ["Category", "Units", "At cost", "At wholesale", "At retail", "Potential profit"];
  const data = [...by.entries()].map(([k, r]) => [k, r.units, money(r.cost), money(r.wholesale), money(r.retail), money(r.retail - r.cost)]);
  const t = [...by.values()].reduce((a, r) => ({ cost: a.cost + r.cost, retail: a.retail + r.retail, wholesale: a.wholesale + r.wholesale, units: a.units + r.units }), { cost: 0, retail: 0, wholesale: 0, units: 0 });
  data.push(["Total", t.units, money(t.cost), money(t.wholesale), money(t.retail), money(t.retail - t.cost)]);
  void cats;
  return (
    <Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => exportPDF("Stock valuation", cols, data, "stock-valuation")}><Download className="h-4 w-4" />PDF</Button>
        <Button variant="outline" size="sm" onClick={() => exportExcel("Valuation", cols, data, "stock-valuation")}><Download className="h-4 w-4" />Excel</Button>
      </div>
      <Table><TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.map((d, i) => <TableRow key={i} className={i === data.length - 1 ? "font-semibold" : ""}>{d.map((v, j) => <TableCell key={j} className={j ? "tabular" : ""}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>
      <p className="mt-2 text-xs text-muted-foreground">Main shop stock only. Back-dated stock values are on the Reports page.</p>
    </Card>
  );
}

/* ---------- movements ---------- */
const typeLabels: Record<string, string> = { opening: "Opening", sale: "Sale", purchase: "Goods received", adjustment: "Adjustment", damaged: "Damaged", expired: "Expired", return: "Customer return", refund: "Refund", transfer_out: "Transfer out", transfer_in: "Transfer in", supplier_return: "Return to supplier", stocktake: "Stocktake" };
function Movements() {
  const [type, setType] = useState("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["movements", "all", type, from, to],
    queryFn: async () => {
      let q = supabase.from("stock_movements").select("*, products(name)").order("created_at", { ascending: false }).limit(500);
      if (type !== "all") q = q.eq("type", type);
      if (from) q = q.gte("created_at", `${from}T00:00:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      return (await q).data ?? [];
    },
  });
  const cols = ["Date", "Product", "Type", "Reference / note", "Qty", "Balance"];
  const rows = data.map((m) => [new Date(m.created_at).toLocaleString(), m.products?.name ?? "", typeLabels[m.type] ?? m.type, m.reference ?? m.note ?? "", Number(m.quantity), Number(m.balance_after)]);
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label>Type</Label><Select value={type} onValueChange={setType}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem>{Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="mv-from">From</Label><Input id="mv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="mv-to">To</Label><Input id="mv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" size="sm" onClick={() => exportPDF("Stock movements", cols, rows, "stock-movements")}><Download className="h-4 w-4" />PDF</Button>
        <Button variant="outline" size="sm" onClick={() => exportExcel("Movements", cols, rows, "stock-movements")}><Download className="h-4 w-4" />Excel</Button>
      </div>
      <Table className="mt-3"><TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((r, i) => <TableRow key={i}>{r.map((v, j) => <TableCell key={j} className={j === 0 || j === 3 ? "text-xs" : j > 3 ? `tabular ${j === 4 && Number(v) < 0 ? "text-destructive" : ""}` : ""}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>
    </Card>
  );
}

/* ---------- branches & categories ---------- */
function Setup({ can }: { can: boolean }) {
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();
  const { data: cats = [] } = useCats();
  const [bn, setBn] = useState("");
  const [cn, setCn] = useState(""); const [parent, setParent] = useState("none");
  async function addBranch() {
    const { error } = await supabase.rpc("save_branch", { p_id: null, p_name: bn, p_active: true } as never);
    if (error) { toast.error(error.message); return; }
    setBn(""); qc.invalidateQueries({ queryKey: ["branches"] });
  }
  async function toggleBranch(id: string, name: string, active: boolean) {
    const { error } = await supabase.rpc("save_branch", { p_id: id, p_name: name, p_active: active });
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["branches"] });
  }
  async function addCat() {
    if (!cn.trim()) return;
    const { error } = await supabase.from("categories").insert({ name: cn.trim(), parent_id: parent === "none" ? null : parent });
    if (error) { toast.error(error.message); return; }
    setCn(""); qc.invalidateQueries({ queryKey: ["categories"] });
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <p className="font-semibold">Branches</p>
        <Table><TableBody>{branches.map((b) => (
          <TableRow key={b.id}><TableCell>{b.name}{b.is_main && <Badge variant="secondary" className="ml-2">Main · sells at the till</Badge>}</TableCell>
            <TableCell className="text-right">{can && !b.is_main && <Button size="sm" variant="ghost" onClick={() => toggleBranch(b.id, b.name, !b.active)}>{b.active ? "Switch off" : "Switch on"}</Button>}{!b.active && <Badge variant="outline">Off</Badge>}</TableCell></TableRow>
        ))}</TableBody></Table>
        {can && <div className="mt-3 flex gap-2"><Input value={bn} onChange={(e) => setBn(e.target.value)} placeholder="New branch or store room" /><Button onClick={addBranch}>Add</Button></div>}
      </Card>
      <Card>
        <p className="font-semibold">Categories & subcategories</p>
        <ul className="mt-2 space-y-1 text-sm">{catOptions(cats).map((c) => <li key={c.id} className={c.label.includes("›") ? "pl-4 text-muted-foreground" : "font-medium"}>{c.label}</li>)}</ul>
        {can && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Input className="flex-1" value={cn} onChange={(e) => setCn(e.target.value)} placeholder="New category name" />
            <Select value={parent} onValueChange={setParent}><SelectTrigger className="w-48" aria-label="Parent category"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Top level</SelectItem>{cats.filter((c) => !c.parent_id).map((c) => <SelectItem key={c.id} value={c.id}>Under {c.name}</SelectItem>)}</SelectContent></Select>
            <Button onClick={addCat}>Add</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
