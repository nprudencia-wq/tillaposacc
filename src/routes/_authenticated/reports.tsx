import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff, useSettings } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, type PayMethod } from "@/lib/pos";
import { methodLabel } from "@/lib/payment-types";
import { exportExcel, exportPDF, type Col, type Row } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Tilla POS" }, { name: "description", content: "Sales, stock and profit reports with PDF and Excel export." }, { property: "og:title", content: "Reports — Tilla POS" }, { property: "og:description", content: "Sales, stock and profit reports with PDF and Excel export." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReportsPage,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const presets: { label: string; get: () => [Date, Date] }[] = [
  { label: "Today", get: () => [new Date(), new Date()] },
  { label: "Yesterday", get: () => { const d = new Date(); d.setDate(d.getDate() - 1); return [d, d]; } },
  { label: "This month", get: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), d]; } },
  { label: "Last month", get: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 0)]; } },
  { label: "This year", get: () => { const d = new Date(); return [new Date(d.getFullYear(), 0, 1), d]; } },
  { label: "Last year", get: () => { const y = new Date().getFullYear() - 1; return [new Date(y, 0, 1), new Date(y, 11, 31)]; } },
];
type Report = { id: string; label: string; cols: Col[]; rows: Row[]; totals?: Row };

function group<T>(list: T[], key: (t: T) => string, val: (t: T) => { qty?: number; total: number; cost?: number }) {
  const m: Record<string, { name: string; qty: number; total: number; cost: number; count: number }> = {};
  list.forEach((t) => {
    const k = key(t); const v = val(t);
    const e = (m[k] ??= { name: k, qty: 0, total: 0, cost: 0, count: 0 });
    e.qty += v.qty ?? 0; e.total += v.total; e.cost += v.cost ?? 0; e.count += 1;
  });
  return Object.values(m).sort((a, b) => b.total - a.total);
}
const r2 = (n: number) => Math.round(n * 100) / 100;

function ReportsPage() {
  const { data: me, isLoading } = useStaff();
  if (isLoading) return null;
  if (!me?.canViewReports) return <p className="p-8 text-muted-foreground">You don't have access to reports. Ask your manager if you need it.</p>;
  return <Reports />;
}

function Reports() {
  const { data: settings } = useSettings();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return iso(d); });
  const [to, setTo] = useState(() => iso(new Date()));
  const [active, setActive] = useState("pl");

  const { data } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59.999").toISOString();
      const [{ data: sales }, { data: items }, { data: pays }, { data: refunds }, { data: products }, { data: profiles }, { data: movements }, { data: expenses }] = await Promise.all([
        supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end),
        supabase.from("sale_items").select("*, sales!inner(created_at, cashier_id), products(category_id, categories(name))").gte("sales.created_at", start).lte("sales.created_at", end),
        supabase.from("sale_payments").select("*, sales!inner(created_at)").gte("sales.created_at", start).lte("sales.created_at", end),
        supabase.from("refunds").select("*").gte("created_at", start).lte("created_at", end),
        supabase.from("products").select("*, categories(name)").order("name"),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("stock_movements").select("*, products(name)").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(1000),
        supabase.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to),
      ]);
      // Stock as at the end date: rewind today's stock using movements made after it.
      let list = products ?? [];
      if (to < iso(new Date())) {
        const { data: later } = await supabase.from("stock_movements").select("product_id, quantity").gt("created_at", end).limit(50000);
        const delta: Record<string, number> = {};
        (later ?? []).forEach((m) => { delta[m.product_id] = (delta[m.product_id] ?? 0) + Number(m.quantity); });
        list = list.map((p) => ({ ...p, stock: Number(p.stock) - (delta[p.id] ?? 0) }));
      }
      return { sales: sales ?? [], items: items ?? [], pays: pays ?? [], refunds: refunds ?? [], products: list, profiles: profiles ?? [], movements: movements ?? [], expenses: expenses ?? [] };
    },
  });

  const reports: Report[] = useMemo(() => {
    if (!data) return [];
    const staff = Object.fromEntries(data.profiles.map((p) => [p.id, p.full_name]));
    const revenue = data.sales.reduce((a, s) => a + Number(s.subtotal), 0);
    const discounts = data.sales.reduce((a, s) => a + Number(s.discount), 0);
    const refunds = data.refunds.reduce((a, r) => a + Number(r.amount), 0);
    const cogs = data.items.reduce((a, i) => a + Number(i.cost_price) * (Number(i.quantity) - Number(i.refunded_qty)), 0);
    const net = revenue - discounts - refunds;
    const expByCat = group(data.expenses, (e) => e.category, (e) => ({ total: Number(e.amount) }));
    const expenses = data.expenses.reduce((a, e) => a + Number(e.amount), 0);
    const gross = net - cogs;
    const netProfit = gross - expenses;
    const moneyCols = (first: string): Col[] => [{ key: "name", label: first }, { key: "qty", label: "Qty" }, { key: "total", label: "Sales (USD)", money: true }, { key: "profit", label: "Gross profit", money: true }];
    const soldBySold = (g: ReturnType<typeof group>) => g.map((x) => ({ name: x.name, qty: r2(x.qty), total: r2(x.total), profit: r2(x.total - x.cost) }));

    const byDay = group(data.sales, (s) => s.created_at.slice(0, 10), (s) => ({ total: Number(s.total) })).sort((a, b) => a.name.localeCompare(b.name));
    const soldQty = group(data.items, (i) => i.product_id ?? i.name, (i) => ({ qty: Number(i.quantity), total: 0 }));
    const soldMap = Object.fromEntries(soldQty.map((x) => [x.name, x.qty]));

    return [
      {
        id: "pl", label: "Profit & loss",
        cols: [{ key: "name", label: "Line" }, { key: "total", label: "USD", money: true }],
        rows: [
          { name: "Gross sales", total: r2(revenue) },
          { name: "Less: discounts", total: r2(-discounts) },
          { name: "Less: refunds", total: r2(-refunds) },
          { name: "Net sales", total: r2(net) },
          { name: "Cost of goods sold", total: r2(-cogs) },
          { name: "Gross profit", total: r2(gross) },
          { name: "Gross margin %", total: net ? r2((gross / net) * 100) : 0 },
          ...expByCat.map((e) => ({ name: `Less expense: ${e.name}`, total: r2(-e.total) })),
          { name: "Total operating expenses", total: r2(-expenses) },
          { name: "Net profit", total: r2(netProfit) },
          { name: "Net margin %", total: net ? r2((netProfit / net) * 100) : 0 },
        ],
      },
      {
        id: "expenses", label: "Expenses",
        cols: [{ key: "name", label: "Date" }, { key: "category", label: "Category" }, { key: "description", label: "Description" }, { key: "total", label: "USD", money: true }],
        rows: [...data.expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map((e) => ({ name: e.expense_date, category: e.category, description: e.description ?? "", total: r2(Number(e.amount)) })),
        totals: { name: "Total", category: "", description: "", total: r2(expenses) },
      },
      {
        id: "daily", label: "Daily sales",
        cols: [{ key: "name", label: "Date" }, { key: "count", label: "Transactions" }, { key: "total", label: "Sales (USD)", money: true }],
        rows: byDay.map((d) => ({ name: d.name, count: d.count, total: r2(d.total) })),
      },
      { id: "product", label: "By product", cols: moneyCols("Product"),
        rows: soldBySold(group(data.items, (i) => i.name, (i) => ({ qty: Number(i.quantity), total: Number(i.line_total), cost: Number(i.cost_price) * Number(i.quantity) }))) },
      { id: "category", label: "By category", cols: moneyCols("Category"),
        rows: soldBySold(group(data.items, (i) => i.products?.categories?.name ?? "Uncategorised", (i) => ({ qty: Number(i.quantity), total: Number(i.line_total), cost: Number(i.cost_price) * Number(i.quantity) }))) },
      {
        id: "cashier", label: "By cashier",
        cols: [{ key: "name", label: "Cashier" }, { key: "count", label: "Transactions" }, { key: "total", label: "Sales (USD)", money: true }],
        rows: group(data.sales, (s) => staff[s.cashier_id] ?? "Unknown", (s) => ({ total: Number(s.total) })).map((x) => ({ name: x.name, count: x.count, total: r2(x.total) })),
      },
      {
        id: "payment", label: "By payment method",
        cols: [{ key: "name", label: "Method" }, { key: "count", label: "Payments" }, { key: "total", label: "Amount received" }],
        rows: group(data.pays, (p) => `${methodLabel(p.method)} (${p.currency})`, (p) => ({ total: Number(p.amount) })).map((x) => ({ name: x.name, count: x.count, total: r2(x.total).toFixed(2) })),
      },
      {
        id: "stock", label: `Stock as at ${to}`,
        cols: [{ key: "name", label: "Product" }, { key: "cat", label: "Category" }, { key: "stock", label: "On hand" }, { key: "cost", label: "Value at cost", money: true }, { key: "retail", label: "Value at retail", money: true }],
        rows: data.products.filter((p) => p.active).map((p) => ({ name: p.name, cat: p.categories?.name ?? "", stock: Number(p.stock), cost: r2(Number(p.stock) * Number(p.cost_price)), retail: r2(Number(p.stock) * Number(p.selling_price)) })),
      },
      {
        id: "low", label: "Low stock",
        cols: [{ key: "name", label: "Product" }, { key: "stock", label: "On hand" }, { key: "min", label: "Minimum" }, { key: "reorder", label: "Suggested order" }],
        rows: data.products.filter((p) => p.active && Number(p.stock) <= Number(p.min_stock)).map((p) => ({ name: p.name, stock: Number(p.stock), min: Number(p.min_stock), reorder: Math.max(0, (Number(p.max_stock) || Number(p.min_stock) * 2) - Number(p.stock)) })),
      },
      {
        id: "movers", label: "Fast & slow movers",
        cols: [{ key: "name", label: "Product" }, { key: "sold", label: "Sold in period" }, { key: "stock", label: "On hand" }, { key: "status", label: "Status" }],
        rows: data.products.filter((p) => p.active).map((p) => ({ name: p.name, sold: soldMap[p.id] ?? 0, stock: Number(p.stock) }))
          .sort((a, b) => b.sold - a.sold)
          .map((p, i, arr) => ({ ...p, status: p.sold === 0 ? "Dead stock" : i < Math.ceil(arr.length * 0.2) ? "Fast" : i >= Math.floor(arr.length * 0.7) ? "Slow" : "Normal" })),
      },
      {
        id: "movement", label: "Stock movement",
        cols: [{ key: "date", label: "Date" }, { key: "name", label: "Product" }, { key: "type", label: "Type" }, { key: "qty", label: "Qty" }, { key: "bal", label: "Balance" }, { key: "ref", label: "Ref / note" }],
        rows: data.movements.map((m) => ({ date: new Date(m.created_at).toLocaleString(), name: m.products?.name ?? "", type: m.type, qty: Number(m.quantity), bal: Number(m.balance_after), ref: m.reference ?? m.note ?? "" })),
      },
    ];
  }, [data]);

  const rep = reports.find((r) => r.id === active);
  const sub = `${settings?.business_name ?? ""} · ${from} to ${to}`;
  const file = `${rep?.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${from}-${to}`;

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Reports</h1>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label htmlFor="rep-from">From</Label><Input id="rep-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="bg-card" /></div>
        <div className="space-y-1.5"><Label htmlFor="rep-to">To</Label><Input id="rep-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="bg-card" /></div>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Button key={p.label} size="sm" variant="ghost" onClick={() => { const [a, b] = p.get(); setFrom(iso(a)); setTo(iso(b)); }}>{p.label}</Button>
          ))}
        </div>
        {rep && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => exportPDF(file, rep.label, sub, rep.cols, rep.rows)}><FileDown className="h-4 w-4" />PDF</Button>
            <Button variant="outline" onClick={() => exportExcel(file, rep.label, rep.cols, rep.rows)}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
          </div>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-52 lg:flex-col">
          {reports.map((r) => (
            <button key={r.id} onClick={() => setActive(r.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium ${active === r.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{r.label}</button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border bg-card shadow-soft">
          {rep && (
            <Table>
              <TableHeader><TableRow>{rep.cols.map((c) => <TableHead key={c.key} className={c.key === "name" ? "" : "text-right"}>{c.label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {rep.rows.map((r, i) => (
                  <TableRow key={i}>
                    {rep.cols.map((c) => (
                      <TableCell key={c.key} className={c.key === "name" ? "font-medium" : "tabular text-right"}>
                        {c.money && typeof r[c.key] === "number" ? money(r[c.key] as number) : r[c.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!rep.rows.length && <TableRow><TableCell colSpan={rep.cols.length} className="py-10 text-center text-muted-foreground">Nothing in this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
