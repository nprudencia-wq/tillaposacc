import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Search, PauseCircle, PlayCircle, X, List, LayoutGrid, ReceiptText, Printer, Archive, Settings2, HandCoins, Menu } from "lucide-react";
import { openDrawer } from "@/lib/hardware";
import { RecentReceipts } from "@/components/RecentReceipts";
import { offlineRef, receiptNumber, takeReservedNumber, topUpReservedNumbers } from "@/lib/receipt-numbers";
import { ProductImage } from "@/components/ProductImage";
import { HardwareSettings } from "@/components/HardwareSettings";
import { CashierDashboard } from "@/components/CashierDashboard";
import { TillSyncButton } from "@/components/TillSyncButton";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ReceiptData } from "@/components/Receipt";
import { SaleComplete, printReceipt } from "@/components/SaleComplete";
import { cached, deviceStorageKey, enqueueSale, isNetworkError, stockAfterQueue, localReceipts, readLocalShift } from "@/lib/offline";
import { internetAvailable, networkRead, setInternetAvailable } from "@/lib/connectivity";
import { useSubscription } from "@/components/SubscriptionBanner";
import { OpenShiftGate, ShiftBar, useOpenShift } from "@/components/Shift";
import {
  cartSubtotal, changeDueUSD, fromUSD, money, paidUSD, resolveDiscount, saleStockError, currencyRate,
  type CartLine, type Currency, type Payment, type PayMethod,
} from "@/lib/pos";
import { activeTypes, isAccountMethod, isCashMethod, methodLabel, usePaymentTypes } from "@/lib/payment-types";
import { CustomerDialog, useCustomers } from "@/components/Customers";
import { creditLimitError, creditSnapshot, customerOwed } from "@/lib/offline-credit";
import { AccountPaymentDialog } from "@/components/AccountPayment";
import { randCheckoutEnabled } from "@/lib/currency-settings";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "Till — Tilla POS" }, { name: "description", content: "Tilla POS checkout, product list and receipt printing." }, { property: "og:title", content: "Till — Tilla POS" }, { property: "og:description", content: "Checkout, product list and receipt printing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PosPage,
});

type Held = { id: string; at: string; lines: CartLine[] };
const HELD_KEY = "tilla-held-sales";

function PosPage() {
  const { data: me } = useStaff();
  const { data: shift, isPending: isLoading } = useOpenShift();
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
    <div className="flex h-full flex-col">
      <ShiftBar shift={shift} canReadX={!!me?.canRefund} />
      <div className="min-h-0 flex-1"><Till shiftId={shift.id} /></div>
    </div>
  );
}

function Till({ shiftId }: { shiftId: string }) {
  const qc = useQueryClient();
  const { data: me } = useStaff();
  const { data: settings } = useSettings();
  usePaymentTypes(); // Download shop tenders before a connection drops, not on first payment.
  const rate = settings?.zig_rate ?? 1;
  const randEnabled = randCheckoutEnabled(settings?.rand_rate ?? 0, settings?.rand_confirmed_rate);
  const randRate = randEnabled ? settings?.rand_rate ?? 0 : 0;

  const { data: catalog = [] } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => cached("products-active", async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)").eq("active", true).order("name");
      if (error) throw error;
      return data;
    }),
  });
  const [queueVersion, setQueueVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setQueueVersion((v) => v + 1);
    window.addEventListener("tilla-queue", refresh);
    return () => window.removeEventListener("tilla-queue", refresh);
  }, []);
  const products = useMemo(() => stockAfterQueue(catalog), [catalog, queueVersion]);
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
  useEffect(() => {
    if (!randEnabled && currency === "ZAR") { setCurrency("USD"); setPayOpen(false); }
  }, [randEnabled, currency]);
  useEffect(() => {
    if (!me?.id) return;
    const top = () => void topUpReservedNumbers();
    top();
    window.addEventListener("online", top); window.addEventListener("tilla-sync", top);
    return () => { window.removeEventListener("online", top); window.removeEventListener("tilla-sync", top); };
  }, [me?.id]);
  const [payOpen, setPayOpen] = useState(false);
  const [held, setHeld] = useState<Held[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hwOpen, setHwOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const saleRef = useRef<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: customers = [] } = useCustomers();
  const [customerId, setCustomerId] = useState<string>("none");
  const [addCust, setAddCust] = useState(false);
  const [payCust, setPayCust] = useState(false);
  // Keep customer balances on the device so credit limits are checked offline too.
  // Refresh on reconnect and every 2 minutes while online, so other tills' credit sales are known before the next outage.
  useEffect(() => {
    const refresh = () => { if (navigator.onLine) void creditSnapshot().catch(() => {}); };
    refresh();
    const t = window.setInterval(refresh, 120_000);
    window.addEventListener("online", refresh);
    return () => { window.clearInterval(t); window.removeEventListener("online", refresh); };
  }, []);
  const customer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    void localReceipts().then((rs) => setLastReceipt(rs[0] ?? null));
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
  const discount = me?.canDiscount ? resolveDiscount(subtotal, discKind, discVal) : 0;
  const total = Math.round((subtotal - discount) * 100) / 100;
  const show = (usd: number) => money(fromUSD(usd, currency, rate, randRate), currency);

  function hold() {
    if (!lines.length) return;
    saveHeld([...held, { id: crypto.randomUUID(), at: new Date().toISOString(), lines }]);
    setLines([]); setDiscVal(0);
    toast.success("Sale held");
  }

  function finish(r: Omit<ReceiptData, "business" | "cashier" | "currency" | "items" | "subtotal" | "discount" | "payments">, paid: Payment[]) {
    const full: ReceiptData = {
      ...r, business: settings?.business_name ?? "", cashier: me?.name ?? "", currency,
      items: lines.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unit_price, line_total: l.unit_price * l.quantity })),
      subtotal, discount, payments: paid,
    };
    setLastReceipt(full);
    saleRef.current = null;
    setPayOpen(false); setLines([]); setDiscVal(0); setCustomerId("none");
    // Account/credit sales: no change to hand over, so go straight to the next sale.
    if (paid.some((p) => isAccountMethod(p.method))) {
      toast.success(`${r.sale_number} charged to account`, { action: { label: "Print", onClick: () => void printReceipt(full, settings) } });
      setTimeout(() => searchRef.current?.focus(), 0);
    } else setReceipt(full);
  }

  async function saveOffline(paid: Payment[], reference?: string) {
    const at = new Date().toISOString();
    if (Math.round(paidUSD(paid, rate, randRate) * 100) < Math.round(total * 100)) { toast.error("Take full payment before finishing an offline sale"); return; }
    // A reference from a failed online attempt must stay (that attempt may have landed); otherwise use a reserved TXN number.
    const reserved = reference ? null : await takeReservedNumber();
    const ref = reference ?? (reserved ? offlineRef(reserved) : `OFF-${crypto.randomUUID()}`);
    const number = reserved ? receiptNumber(reserved) : ref;
    const change = Math.max(0, Math.round((paidUSD(paid, rate, randRate) - total) * 100) / 100);
    const snapshot: ReceiptData = {
      sale_number: number, created_at: at, business: settings?.business_name ?? "", cashier: me?.name ?? "", customer: customer?.name ?? null,
      currency, rate: currency === "ZAR" ? randRate : rate, total, change, subtotal, discount, payments: paid,
      items: lines.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unit_price, line_total: l.unit_price * l.quantity })),
    };
    await enqueueSale({
      client_ref: ref, sold_at: new Date().toISOString(), shift_id: shiftId, currency, discount,
      items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })), payments: paid, total, rate, rand_rate: randRate, receipt: snapshot,
      ...(customer ? { customer_id: customer.id } : {}),
    });
    window.__lovableEvents?.track?.("project.till_sale_completed", { mode: "offline", currency });
    finish({ sale_number: number, created_at: at, rate: currency === "ZAR" ? randRate : rate, total, change }, paid);
    const nonCash = paid.some((p) => !isCashMethod(p.method));
    toast.success(`Saved offline as ${number}. It will upload when you're back online.${nonCash ? " Non-cash payments will need checking." : ""}`);
  }

  async function complete(payments: Payment[]) {
    if (!randEnabled && (currency === "ZAR" || payments.some((p) => p.currency === "ZAR"))) {
      toast.error("Confirm the Rand conversion in Currency settings first"); return;
    }
    for (const line of lines) {
      const stock = Number(products.find((p) => p.id === line.product_id)?.stock ?? 0);
      const error = saleStockError(line.name, line.quantity, stock);
      if (error) { toast.error(error); return; }
    }
    const paid = payments.filter((p) => p.amount > 0).map((p) => ({ ...p, exchange_rate: currencyRate(p.currency, rate, randRate) }));
    const onAccount = paid.some((p) => isAccountMethod(p.method));
    if (onAccount && !customer) { toast.error("Choose the customer first to put this sale on account"); return; }
    if (onAccount && customer) {
      // Checked on the till too, so the limit still holds with no internet.
      const charge = paid.filter((p) => isAccountMethod(p.method)).reduce((n, p) => n + p.amount / (p.exchange_rate || 1), 0);
      const limitError = creditLimitError(customer.name, Number(customer.credit_limit), await customerOwed(customer.id), charge);
      if (limitError) { toast.error(limitError); return; }
      if (paidUSD(paid, rate, randRate) - total > 0.005) { toast.error("An on-account sale cannot give change"); return; }
    }
    const overridden = lines.some((l) => l.unit_price !== listPrice(l.product_id));
    if (!internetAvailable() && overridden) { toast.error("Changed prices need the internet. Undo the price change or wait to reconnect."); return; }
    // Only a reference that was actually sent online must be kept; an unsent sale gets a TXN number reserved for this till.
    const sentBefore = saleRef.current;
    const ref = saleRef.current ?? `TILL-${crypto.randomUUID()}`;
    if (!internetAvailable() || await readLocalShift()) {
      if (overridden) { toast.error("Upload this shift before using changed prices"); return; }
      await saveOffline(paid, sentBefore ?? undefined); return;
    }
    saleRef.current = ref;
    // With the device itself offline the request never leaves, so the reference is not needed.
    const unsent = () => (typeof navigator !== "undefined" && !navigator.onLine && !sentBefore ? undefined : ref);
    let result;
    try { result = await networkRead(() => supabase.rpc("complete_sale_once", {
      p_client_ref: ref,
      p_items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, ...(l.unit_price !== listPrice(l.product_id) ? { price: l.unit_price } : {}) })),
      p_payments: paid as never,
      p_discount: discount,
      p_currency: currency,
      ...(customer ? { p_customer: customer.id } : {}),
    })); } catch (e) {
      if (isNetworkError(e) && !overridden) { setInternetAvailable(false); await saveOffline(paid, unsent()); return; }
      throw e;
    }
    const { data, error } = result;
    if (error && isNetworkError(error) && !overridden) { setInternetAvailable(false); await saveOffline(paid, unsent()); return; }
    if (error) { toast.error(error.message); qc.invalidateQueries({ queryKey: ["open-shift"] }); return; }
    window.__lovableEvents?.track?.("project.till_sale_completed", { mode: "online", currency });
    const res = data as { sale_number: string; total: number; change: number; rate: number };
    finish({ sale_number: res.sale_number, created_at: new Date().toISOString(), rate: Number(res.rate), total: Number(res.total), change: Number(res.change) }, paid);
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["customer-ledger"] });
    if (onAccount) void creditSnapshot().catch(() => {});
    window.dispatchEvent(new Event("tilla-sale"));
    toast.success(`Sale ${res.sale_number} completed`);
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden md:flex-row">
      {/* Cart */}
      <aside className="flex max-h-[50vh] w-full shrink-0 flex-col border-t bg-card md:max-h-none order-last md:order-3 md:w-[320px] md:border-l md:border-t-0 xl:w-[360px]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-b px-3 py-2">
          <h2 className="text-base font-bold">Sale</h2>
          <div className="flex min-w-0 justify-end gap-1 overflow-x-auto">
            <Button size="sm" variant="ghost" className="shrink-0 text-destructive" disabled={!lines.length && customerId === "none"} onClick={() => { setLines([]); setDiscVal(0); setCustomerId("none"); saleRef.current = null; searchRef.current?.focus(); }}><Trash2 className="h-4 w-4" />Clear</Button>
            <Button size="sm" variant="ghost" className="shrink-0" onClick={hold} disabled={!lines.length}><PauseCircle className="h-4 w-4" />Hold</Button>
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setHeldOpen(true)}><PlayCircle className="h-4 w-4" />Held ({held.length})</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!lines.length && <p className="p-8 text-center text-sm text-muted-foreground">Tap a product or scan a barcode.</p>}
          {lines.map((l) => (
            <div key={l.product_id} className="flex items-center gap-2 border-b px-3 py-2">
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
        <div className="space-y-2 border-t p-3">
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
            {customer && <Button size="icon" variant="outline" className="h-9 w-9" title="Take account payment" aria-label={`Take account payment from ${customer.name}`} onClick={() => setPayCust(true)}><HandCoins className="h-4 w-4" /></Button>}
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
              {(["USD", "ZiG", "ZAR"] as Currency[]).map((c) => (
                <Button key={c} size="sm" variant={currency === c ? "default" : "ghost"} disabled={c === "ZAR" && randRate <= 0} onClick={() => setCurrency(c)}>{c === "ZAR" ? "Rand" : c}</Button>
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
      {/* Categories */}
      <nav aria-label="Categories" className="hidden w-36 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-muted/40 p-2 md:order-1 md:flex lg:w-44">
        <Button variant={cat === null ? "default" : "ghost"} className="h-11 justify-start whitespace-normal text-left" onClick={() => setCat(null)}>All products</Button>
        {categories.map((c) => <Button key={c.id} variant={cat === c.id ? "default" : "ghost"} className="h-auto min-h-11 justify-start whitespace-normal py-2 text-left" onClick={() => setCat(c.id)}>{c.name}</Button>)}
      </nav>
      {/* Products */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col p-2 md:order-2 md:p-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" aria-label="Open till menu" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search products by name, SKU or barcode"
            onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}
            placeholder="Search name, SKU or scan barcode…" className="h-11 bg-card pl-10 text-base"
          />
          </div>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 md:hidden">
          <Button size="sm" variant={cat === null ? "default" : "outline"} onClick={() => setCat(null)} className="h-8 shrink-0 rounded-full px-3 text-xs">All</Button>
          {categories.map((c) => <Button key={c.id} size="sm" variant={cat === c.id ? "default" : "outline"} onClick={() => setCat(c.id)} className="h-8 shrink-0 rounded-full px-3 text-xs">{c.name}</Button>)}
        </div>
        <div className={view === "tile" ? "mt-2 grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-y-auto" : "mt-2 min-h-0 flex-1 overflow-y-auto divide-y border-y"}>
          {filtered.map((p) => {
            const low = Number(p.stock) <= Number(p.min_stock);
            const out = Number(p.stock) <= 0;
            if (view === "list") return <Button key={p.id} variant="ghost" disabled={out} onClick={() => add(p)} aria-label={`Add ${p.name}`} className="h-20 w-full justify-start gap-3 rounded-none px-2 text-left">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-primary">{p.image_url ? <ProductImage src={p.image_url} className="h-full w-full object-cover" /> : p.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-base font-bold">{p.name}</div><div className="truncate text-xs font-normal text-muted-foreground">{p.sku} {p.categories?.name ? `· ${p.categories.name}` : ""}</div><div className={out || low ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{out ? "Out of stock" : `${Number(p.stock)} in stock`}</div></div>
              <span className="shrink-0 font-mono text-lg font-bold text-primary">{show(Number(p.selling_price))}</span><Plus className="h-4 w-4 shrink-0" />
            </Button>;
            return (
              <Button key={p.id} variant="outline" disabled={out} onClick={() => add(p)} aria-label={`Add ${p.name}`}
                className="group flex h-auto min-h-[150px] flex-col items-stretch whitespace-normal rounded-lg border-2 bg-card p-2.5 text-left shadow-soft transition active:scale-[0.98] hover:border-primary">
                <div className="mb-2 grid h-20 place-items-center rounded-lg bg-secondary font-display text-2xl font-bold text-primary">
                  {p.image_url ? <ProductImage src={p.image_url} className="h-full w-full rounded-lg object-cover" /> : p.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="line-clamp-2 text-base font-bold leading-tight">{p.name}</div>
                <div className="mt-auto flex items-end justify-between pt-2">
                  <span className="tabular text-lg font-bold text-primary">{show(Number(p.selling_price))}</span>
                  <span className={`text-xs ${low ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{out ? "Out of stock" : `${Number(p.stock)} left`}</span>
                </div>
              </Button>
            );
          })}
          {!filtered.length && <p className="col-span-full py-12 text-center text-muted-foreground">No products found.</p>}
        </div>
      </section>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader><SheetTitle>Till menu</SheetTitle></SheetHeader>
          <div className="mt-4 grid gap-2" onClick={(e) => { if ((e.target as HTMLElement).closest("[data-close]")) setMenuOpen(false); }}>
            <Button data-close variant="outline" className="h-12 justify-start" onClick={() => setDashboardOpen(true)}><ReceiptText className="h-5 w-5" />My day — today's report</Button>
            <TillSyncButton />
            <Button data-close variant="outline" className="h-12 justify-start" onClick={() => setReprintOpen(true)}><ReceiptText className="h-5 w-5" />Receipts</Button>
            <Button data-close variant="outline" className="h-12 justify-start" onClick={() => setHeldOpen(true)}><PlayCircle className="h-5 w-5" />Held sales ({held.length})</Button>
            <Button data-close variant="outline" className="h-12 justify-start" onClick={() => openDrawer().then(() => toast.success("Drawer opened"), (e) => toast.error(e instanceof Error ? e.message : "Drawer failed"))}><Archive className="h-5 w-5" />Open drawer</Button>
            <Button data-close variant="outline" className="h-12 justify-start" disabled={!lastReceipt} onClick={() => lastReceipt && void printReceipt(lastReceipt, settings)}><Printer className="h-5 w-5" />Reprint last receipt</Button>
            <Button data-close variant="outline" className="h-12 justify-start" onClick={() => setHwOpen(true)}><Settings2 className="h-5 w-5" />Printer & drawer setup</Button>
            <div className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Product view</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={view === "tile" ? "default" : "outline"} aria-pressed={view === "tile"} onClick={() => { setView("tile"); localStorage.setItem(deviceStorageKey("tilla-product-view"), "tile"); }}><LayoutGrid className="h-4 w-4" />Tiles</Button>
              <Button variant={view === "list" ? "default" : "outline"} aria-pressed={view === "list"} onClick={() => { setView("list"); localStorage.setItem(deviceStorageKey("tilla-product-view"), "list"); }}><List className="h-4 w-4" />List</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {payCust && customer && <AccountPaymentDialog customer={customer} shiftId={shiftId} zigRate={rate} randRate={randRate} randEnabled={randEnabled} onClose={() => setPayCust(false)} />}
      {addCust && <CustomerDialog customer={null} onClose={() => setAddCust(false)} onSaved={(c) => { qc.invalidateQueries({ queryKey: ["customers"] }); setCustomerId(c.id); }} />}
      {payOpen && <PayDialog total={total} currency={currency} rate={rate} randRate={randRate} onClose={() => setPayOpen(false)} onPay={complete} />}

      <RecentReceipts open={reprintOpen} onOpenChange={setReprintOpen} />
      <HardwareSettings open={hwOpen} onOpenChange={setHwOpen} />
      {me && dashboardOpen && <CashierDashboard open={dashboardOpen} onOpenChange={setDashboardOpen} cashier={me} products={products} />}
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

function PayDialog({ total, currency, rate, randRate, onClose, onPay }: {
  total: number; currency: Currency; rate: number; randRate: number; onClose: () => void; onPay: (p: Payment[]) => Promise<void>;
}) {
  const { data: types } = usePaymentTypes();
  const methods = activeTypes(types);
  const first = methods[0]?.code ?? "cash";
  const second = methods.find((t) => !t.is_cash && t.code !== first)?.code ?? first;
  const [payments, setPayments] = useState<Payment[]>([{ method: first, currency, amount: fromUSD(total, currency, rate, randRate) }]);
  const [busy, setBusy] = useState(false);
  const change = changeDueUSD(total, payments, rate, randRate);
  const upd = (i: number, p: Partial<Payment>) => setPayments((ps) => ps.map((x, k) => (k === i ? { ...x, ...p } : x)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Take payment · {money(fromUSD(total, currency, rate, randRate), currency)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {payments.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Select value={p.method} onValueChange={(v) => upd(i, { method: v as PayMethod })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{methods.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={p.currency} onValueChange={(v) => upd(i, { currency: v as Currency })}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem><SelectItem value="ZAR" disabled={randRate <= 0}>Rand</SelectItem></SelectContent>
              </Select>
              <Input type="number" min={0} step="0.01" value={p.amount || ""} onChange={(e) => upd(i, { amount: Number(e.target.value) })} className="tabular flex-1" />
              {payments.length > 1 && <Button size="icon" variant="ghost" aria-label={`Remove this ${methodLabel(p.method)} payment`} onClick={() => setPayments(payments.filter((_, k) => k !== i))}><X className="h-4 w-4" /></Button>}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setPayments([...payments, { method: second, currency, amount: Math.max(0, fromUSD(-change, currency, rate, randRate)) }])}>
            <Plus className="h-4 w-4" />Split payment
          </Button>
          <div className="tabular rounded-xl bg-muted p-4">
            <div className="flex justify-between text-sm"><span>Paid</span><span>{money(fromUSD(paidUSD(payments, rate, randRate), currency, rate, randRate), currency)}</span></div>
            <div className={`flex justify-between font-display text-xl font-bold ${change < 0 ? "text-destructive" : "text-success"}`}>
              <span>{change < 0 ? "Still owed" : "Change"}</span>
              <span>{money(fromUSD(Math.abs(change), currency, rate, randRate), currency)}</span>
            </div>
            {change > 0 && currency === "USD" && <div className="text-right text-xs text-muted-foreground">or {money(fromUSD(change, "ZiG", rate), "ZiG")}</div>}
          </div>
          <Button size="lg" className="h-14 w-full text-lg" disabled={change < 0 || busy || !methods.length}
            onClick={async () => { setBusy(true); try { await onPay(payments); } catch (e) { toast.error(e instanceof Error ? e.message : "Sale not saved. Keep this sale open and try again."); } finally { setBusy(false); } }}>
            Complete sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
