import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Search, PauseCircle, PlayCircle, X, List, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ReceiptData } from "@/components/Receipt";
import { SaleComplete } from "@/components/SaleComplete";
import { cached, deviceStorageKey, enqueueSale, isNetworkError } from "@/lib/offline";
import { useSubscription } from "@/components/SubscriptionBanner";
import { OpenShiftGate, ShiftBar, useOpenShift } from "@/components/Shift";
import {
  cartSubtotal, changeDueUSD, fromUSD, money, paidUSD, resolveDiscount, saleStockError,
  type CartLine, type Currency, type Payment, type PayMethod,
} from "@/lib/pos";
import { activeTypes, isAccountMethod, isCashMethod, methodLabel, usePaymentTypes } from "@/lib/payment-types";
import { CustomerDialog, useCustomers } from "@/components/Customers";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "Till — Tilla POS" }, { name: "description", content: "Tilla POS checkout, product list and receipt printing." }, { property: "og:title", content: "Till — Tilla POS" }, { property: "og:description", content: "Checkout, product list and receipt printing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PosPage,
});

type Held = { id: string; at: string; lines: CartLine[] };
const HELD_KEY = "tilla-held-sales";

function PosPage() {
  const { data: me } = useStaff();
  const { data: shift, isLoading } = useOpenShift();
  const sub = useSubscription();
  if (sub?.state === "locked") return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="font-display text-2xl font-bold">Till locked</h1>
      <p className="mt-2 text-muted-foreground">The subscription has expired. The owner or a manager can renew it on the Billing page.</p>
    </div>
  );
  if (isLoading) return <p className="p-8 text-muted-foreground">Loading till…</p>;
  if (!shift) return <OpenShiftGate />;
  return (
    <div className="flex h-screen flex-col">
      <ShiftBar shift={shift} canReadX={!!me?.canRefund} />
      <div className="min-h-0 flex-1"><Till shiftId={shift.id} /></div>
    </div>
  );
}

function Till({ shiftId }: { shiftId: string }) {
  const qc = useQueryClient();
  const { data: me } = useStaff();
  const { data: settings } = useSettings();
  const rate = settings?.zig_rate ?? 1;

  const { data: products = [] } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => cached("products-active", async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)").eq("active", true).order("name");
      if (error) throw error;
      return data;
    }),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => cached("categories", async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    }),
  });

  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "tile">("list");
  const [cat, setCat] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discKind, setDiscKind] = useState<"percent" | "fixed">("percent");
  const [discVal, setDiscVal] = useState(0);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [payOpen, setPayOpen] = useState(false);
  const [held, setHeld] = useState<Held[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: customers = [] } = useCustomers();
  const [customerId, setCustomerId] = useState<string>("none");
  const [addCust, setAddCust] = useState(false);
  const customer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    try { setHeld(JSON.parse(localStorage.getItem(deviceStorageKey(HELD_KEY)) || "[]")); } catch { /* identity not ready */ }
    try { setView(localStorage.getItem(deviceStorageKey("tilla-product-view")) === "tile" ? "tile" : "list"); } catch { /* list default */ }
    searchRef.current?.focus();
  }, [me?.id, me?.storeId]);
  const saveHeld = (h: Held[]) => { setHeld(h); localStorage.setItem(deviceStorageKey(HELD_KEY), JSON.stringify(h)); };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) =>
      (!cat || p.category_id === cat) &&
      (!s || p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s) || p.barcode?.includes(s)));
  }, [products, q, cat]);

  const listPrice = (id: string) => Number(products.find((p) => p.id === id)?.selling_price ?? 0);
  function changePrice(id: string, name: string, current: number) {
    const v = window.prompt(`New price for ${name} in USD (list price ${money(listPrice(id))})`, String(current));
    if (v === null) return;
    const n = Math.round(Number(v) * 100) / 100;
    if (!Number.isFinite(n) || n < 0) { toast.error("Enter a valid price"); return; }
    setLines((ls) => ls.map((l) => (l.product_id === id ? { ...l, unit_price: n } : l)));
  }
  function add(p: (typeof products)[number]) {
    const requested = (lines.find((l) => l.product_id === p.id)?.quantity ?? 0) + 1;
    const error = saleStockError(p.name, requested, Number(p.stock));
    if (error) { toast.error(error); return; }
    setLines((ls) => {
      const ex = ls.find((l) => l.product_id === p.id);
      if (ex) return ls.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { product_id: p.id, name: p.name, unit_price: Number(p.selling_price), quantity: 1, stock: Number(p.stock) }];
    });
  }
  function setQty(id: string, qty: number) {
    const item = products.find((p) => p.id === id);
    if (qty > 0 && item) {
      const error = saleStockError(item.name, qty, Number(item.stock));
      if (error) { toast.error(error); return; }
    }
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.product_id !== id) : ls.map((l) => (l.product_id === id ? { ...l, quantity: qty } : l))));
  }

  // Barcode scanners type the code then press Enter.
  function onSearchEnter() {
    const s = q.trim();
    if (!s) return;
    const hit = products.find((p) => p.barcode === s || p.sku?.toLowerCase() === s.toLowerCase());
    const target = hit ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) { add(target); setQ(""); } else toast.error("No product matches that code");
  }

  const subtotal = cartSubtotal(lines);
  const discount = resolveDiscount(subtotal, discKind, discVal);
  const total = Math.round((subtotal - discount) * 100) / 100;
  const show = (usd: number) => money(fromUSD(usd, currency, rate), currency);

  function hold() {
    if (!lines.length) return;
    saveHeld([...held, { id: crypto.randomUUID(), at: new Date().toISOString(), lines }]);
    setLines([]); setDiscVal(0);
    toast.success("Sale held");
  }

  function finish(r: Omit<ReceiptData, "business" | "cashier" | "currency" | "items" | "subtotal" | "discount" | "payments">, paid: Payment[]) {
    setReceipt({
      ...r, business: settings?.business_name ?? "", cashier: me?.name ?? "", currency,
      items: lines.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unit_price, line_total: l.unit_price * l.quantity })),
      subtotal, discount, payments: paid,
    });
    setPayOpen(false); setLines([]); setDiscVal(0); setCustomerId("none");
  }

  function saveOffline(paid: Payment[]) {
    const ref = `OFF-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    enqueueSale({
      client_ref: ref, sold_at: new Date().toISOString(), shift_id: shiftId, currency, discount,
      items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })), payments: paid, total, rate,
    });
    // Reduce the cached stock so the till shows sensible numbers while offline.
    qc.setQueryData(["products", "active"], (old: typeof products | undefined) =>
      old?.map((p) => { const l = lines.find((x) => x.product_id === p.id); return l ? { ...p, stock: Number(p.stock) - l.quantity } : p; }));
    const change = Math.max(0, Math.round((paidUSD(paid, rate) - total) * 100) / 100);
    finish({ sale_number: ref, created_at: new Date().toISOString(), rate, total, change }, paid);
    const nonCash = paid.some((p) => !isCashMethod(p.method));
    toast.success(`Saved offline as ${ref}. It will upload when you're back online.${nonCash ? " Non-cash payments will need checking." : ""}`);
  }

  async function complete(payments: Payment[]) {
    for (const line of lines) {
      const stock = Number(products.find((p) => p.id === line.product_id)?.stock ?? 0);
      const error = saleStockError(line.name, line.quantity, stock);
      if (error) { toast.error(error); return; }
    }
    const paid = payments.filter((p) => p.amount > 0);
    const onAccount = paid.some((p) => isAccountMethod(p.method));
    if (onAccount && !customer) { toast.error("Choose the customer first to put this sale on account"); return; }
    if (onAccount && !navigator.onLine) { toast.error("On-account sales need the internet so the credit limit can be checked"); return; }
    const overridden = lines.some((l) => l.unit_price !== listPrice(l.product_id));
    if (!navigator.onLine && overridden) { toast.error("Changed prices need the internet. Undo the price change or wait to reconnect."); return; }
    if (!navigator.onLine) { saveOffline(paid); return; }
    const { data, error } = await supabase.rpc("complete_sale", {
      p_items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, ...(l.unit_price !== listPrice(l.product_id) ? { price: l.unit_price } : {}) })),
      p_payments: payments.filter((p) => p.amount > 0) as never,
      p_discount: discount,
      p_currency: currency,
      ...(customer ? { p_customer: customer.id } : {}),
    });
    if (error && isNetworkError(error) && !onAccount && !overridden) { saveOffline(paid); return; }
    if (error) { toast.error(error.message); qc.invalidateQueries({ queryKey: ["open-shift"] }); return; }
    const res = data as { sale_number: string; total: number; change: number; rate: number };
    finish({ sale_number: res.sale_number, created_at: new Date().toISOString(), rate: Number(res.rate), total: Number(res.total), change: Number(res.change) }, paid);
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["customer-ledger"] });
    toast.success(`Sale ${res.sale_number} completed`);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Products */}
      <section className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search products by name, SKU or barcode"
            onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}
            placeholder="Search name, SKU or scan barcode…" className="h-12 bg-card pl-10 text-base"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex shrink-0 gap-1 border-r pr-2">
            <Button size="icon" variant={view === "list" ? "default" : "outline"} title="List view" aria-label="List view" aria-pressed={view === "list"} onClick={() => { setView("list"); localStorage.setItem(deviceStorageKey("tilla-product-view"), "list"); }}><List className="h-4 w-4" /></Button>
            <Button size="icon" variant={view === "tile" ? "default" : "outline"} title="Tile view" aria-label="Tile view" aria-pressed={view === "tile"} onClick={() => { setView("tile"); localStorage.setItem(deviceStorageKey("tilla-product-view"), "tile"); }}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          <Button size="sm" variant={cat === null ? "default" : "outline"} onClick={() => setCat(null)}>All</Button>
          {categories.map((c) => (
            <Button key={c.id} size="sm" variant={cat === c.id ? "default" : "outline"} onClick={() => setCat(c.id)} className="shrink-0">{c.name}</Button>
          ))}
          </div>
        </div>
        <div className={view === "tile" ? "mt-4 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4" : "mt-4 min-h-0 flex-1 overflow-y-auto divide-y border-y"}>
          {filtered.map((p) => {
            const low = Number(p.stock) <= Number(p.min_stock);
            const out = Number(p.stock) <= 0;
            if (view === "list") return <Button key={p.id} variant="ghost" disabled={out} onClick={() => add(p)} aria-label={`Add ${p.name}`} className="h-20 w-full justify-start gap-3 rounded-none px-2 text-left">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-primary">{p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{p.name}</div><div className="truncate text-xs font-normal text-muted-foreground">{p.sku} {p.categories?.name ? `· ${p.categories.name}` : ""}</div><div className={out || low ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{out ? "Out of stock" : `${Number(p.stock)} in stock`}</div></div>
              <span className="shrink-0 font-mono font-semibold text-primary">{show(Number(p.selling_price))}</span><Plus className="h-4 w-4 shrink-0" />
            </Button>;
            return (
              <Button key={p.id} variant="outline" disabled={out} onClick={() => add(p)} aria-label={`Add ${p.name}`}
                className="group flex h-auto flex-col items-stretch whitespace-normal rounded-md bg-card p-3 text-left shadow-soft transition active:scale-[0.98] hover:border-primary">
                <div className="mb-3 grid h-16 place-items-center rounded-lg bg-secondary font-display text-2xl font-bold text-primary">
                  {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full rounded-lg object-cover" /> : p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</div>
                <div className="mt-auto flex items-end justify-between pt-2">
                  <span className="tabular text-base font-semibold text-primary">{show(Number(p.selling_price))}</span>
                  <span className={`text-xs ${low ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{out ? "Out of stock" : `${Number(p.stock)} left`}</span>
                </div>
              </Button>
            );
          })}
          {!filtered.length && <p className="col-span-full py-12 text-center text-muted-foreground">No products found.</p>}
        </div>
      </section>

      {/* Cart */}
      <aside className="flex max-h-[55vh] w-full flex-col border-t bg-card lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-bold">Current sale</h2>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={hold} disabled={!lines.length}><PauseCircle className="h-4 w-4" />Hold</Button>
            <Button size="sm" variant="ghost" onClick={() => setHeldOpen(true)}><PlayCircle className="h-4 w-4" />Held ({held.length})</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!lines.length && <p className="p-8 text-center text-sm text-muted-foreground">Tap a product or scan a barcode.</p>}
          {lines.map((l) => (
            <div key={l.product_id} className="flex items-center gap-2 border-b px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{l.name}</div>
                <div className="tabular text-xs text-muted-foreground">{show(l.unit_price)} each
                  {listPrice(l.product_id) !== l.unit_price && <span className="ml-1 text-warning">(price changed from {show(listPrice(l.product_id))})</span>}
                  {me?.canOverridePrice && <button type="button" className="ml-2 underline" aria-label={`Change price of ${l.name}`} onClick={() => changePrice(l.product_id, l.name, l.unit_price)}>Change price</button>}
                </div>
                {l.quantity > l.stock && <div className="text-xs text-destructive">Only {l.stock} in stock</div>}
              </div>
              <Button size="icon" variant="outline" className="h-9 w-9" aria-label={`Reduce quantity of ${l.name}`} onClick={() => setQty(l.product_id, l.quantity - 1)}><Minus className="h-4 w-4" /></Button>
              <span className="tabular w-8 text-center font-semibold">{l.quantity}</span>
              <Button size="icon" variant="outline" className="h-9 w-9" aria-label={`Add one more ${l.name}`} onClick={() => setQty(l.product_id, l.quantity + 1)}><Plus className="h-4 w-4" /></Button>
              <span className="tabular w-20 text-right text-sm font-semibold">{show(l.unit_price * l.quantity)}</span>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label={`Remove ${l.name} from this sale`} onClick={() => setQty(l.product_id, 0)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Customer</span>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-9 flex-1" aria-label="Customer for this sale"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Walk-in customer</SelectItem>
                {customers.filter((c) => c.active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Add a new customer" onClick={() => setAddCust(true)}><Plus className="h-4 w-4" /></Button>
          </div>
          {me?.canDiscount !== false && <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Discount</span>
            <Select value={discKind} onValueChange={(v) => setDiscKind(v as "percent" | "fixed")}>
              <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">$</SelectItem></SelectContent>
            </Select>
            <Input type="number" min={0} value={discVal || ""} onChange={(e) => setDiscVal(Number(e.target.value))} className="h-9 flex-1" placeholder="0" />
          </div>}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Currency</span>
            <div className="flex rounded-lg bg-muted p-1">
              {(["USD", "ZiG"] as Currency[]).map((c) => (
                <button key={c} onClick={() => setCurrency(c)} className={`rounded-md px-4 py-1 text-sm font-semibold ${currency === c ? "bg-card shadow-soft" : "text-muted-foreground"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="tabular space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{show(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-destructive"><span>Discount</span><span>-{show(discount)}</span></div>}
            <div className="flex justify-between pt-1 font-display text-2xl font-bold"><span>Total</span><span>{show(total)}</span></div>
            {currency === "ZiG" && <div className="text-right text-xs text-muted-foreground">{money(total)} at ZiG {rate}/USD</div>}
          </div>
          <Button size="lg" className="h-14 w-full text-lg" disabled={!lines.length} onClick={() => setPayOpen(true)}>Charge {show(total)}</Button>
        </div>
      </aside>

      {addCust && <CustomerDialog customer={null} onClose={() => setAddCust(false)} onSaved={(c) => { qc.invalidateQueries({ queryKey: ["customers"] }); setCustomerId(c.id); }} />}
      {payOpen && <PayDialog total={total} currency={currency} rate={rate} onClose={() => setPayOpen(false)} onPay={complete} />}

      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Held sales</DialogTitle></DialogHeader>
          {!held.length && <p className="text-sm text-muted-foreground">No held sales.</p>}
          {held.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-semibold">{h.lines.length} items · {money(cartSubtotal(h.lines))}</div>
                <div className="text-xs text-muted-foreground">{new Date(h.at).toLocaleTimeString()}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={() => { setLines(h.lines); saveHeld(held.filter((x) => x.id !== h.id)); setHeldOpen(false); }}>Resume</Button>
                <Button size="icon" variant="ghost" aria-label={`Discard held sale of ${h.lines.length} items`} onClick={() => saveHeld(held.filter((x) => x.id !== h.id))}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </DialogContent>
      </Dialog>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sale complete</DialogTitle></DialogHeader>
          {receipt && <SaleComplete receipt={receipt} onNext={() => { setReceipt(null); searchRef.current?.focus(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayDialog({ total, currency, rate, onClose, onPay }: {
  total: number; currency: Currency; rate: number; onClose: () => void; onPay: (p: Payment[]) => Promise<void>;
}) {
  const { data: types } = usePaymentTypes();
  const methods = activeTypes(types);
  const first = methods[0]?.code ?? "cash";
  const second = methods.find((t) => !t.is_cash && t.code !== first)?.code ?? first;
  const [payments, setPayments] = useState<Payment[]>([{ method: first, currency, amount: fromUSD(total, currency, rate) }]);
  const [busy, setBusy] = useState(false);
  const change = changeDueUSD(total, payments, rate);
  const upd = (i: number, p: Partial<Payment>) => setPayments((ps) => ps.map((x, k) => (k === i ? { ...x, ...p } : x)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Take payment · {money(fromUSD(total, currency, rate), currency)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {payments.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Select value={p.method} onValueChange={(v) => upd(i, { method: v as PayMethod })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{methods.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={p.currency} onValueChange={(v) => upd(i, { currency: v as Currency })}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem></SelectContent>
              </Select>
              <Input type="number" min={0} step="0.01" value={p.amount || ""} onChange={(e) => upd(i, { amount: Number(e.target.value) })} className="tabular flex-1" />
              {payments.length > 1 && <Button size="icon" variant="ghost" aria-label={`Remove this ${methodLabel(p.method)} payment`} onClick={() => setPayments(payments.filter((_, k) => k !== i))}><X className="h-4 w-4" /></Button>}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setPayments([...payments, { method: second, currency, amount: Math.max(0, fromUSD(-change, currency, rate)) }])}>
            <Plus className="h-4 w-4" />Split payment
          </Button>
          <div className="tabular rounded-xl bg-muted p-4">
            <div className="flex justify-between text-sm"><span>Paid</span><span>{money(fromUSD(paidUSD(payments, rate), currency, rate), currency)}</span></div>
            <div className={`flex justify-between font-display text-xl font-bold ${change < 0 ? "text-destructive" : "text-success"}`}>
              <span>{change < 0 ? "Still owed" : "Change"}</span>
              <span>{money(fromUSD(Math.abs(change), currency, rate), currency)}</span>
            </div>
            {change > 0 && currency === "USD" && <div className="text-right text-xs text-muted-foreground">or {money(fromUSD(change, "ZiG", rate), "ZiG")}</div>}
          </div>
          <Button size="lg" className="h-14 w-full text-lg" disabled={change < 0 || busy}
            onClick={async () => { setBusy(true); await onPay(payments); setBusy(false); }}>
            Complete sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
