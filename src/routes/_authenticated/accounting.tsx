import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, FileDown, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/pos";
import { exportExcel, exportPDF, type Col, type Row } from "@/lib/export";
import { assetSchedule, balanceSheet, journalBalanced, profitFor, trialBalance, type AccountType, type GlAccount, type GlLine, type TbRow } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting — Tilla POS" },
      { name: "description", content: "General ledger, trial balance, balance sheet and journals built from your till." },
      { property: "og:title", content: "Accounting — Tilla POS" },
      { property: "og:description", content: "General ledger, trial balance, balance sheet and journals built from your till." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountingPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const TYPE_LABEL: Record<AccountType, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };
const SOURCE_LABEL: Record<string, string> = {
  sale: "Sale", refund: "Refund", grn: "Goods received", supplier_payment: "Supplier payment", supplier_return: "Return to supplier",
  expense: "Expense", customer_payment: "Customer payment", customer_adjustment: "Balance adjustment", stock: "Stock change", journal: "Journal",
};

function AccountingPage() {
  const { data: me } = useStaff();
  const allowed = me?.roles.some((r) => ["admin", "owner", "manager", "accountant"].includes(r));
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());

  const { data: accounts } = useQuery({
    queryKey: ["gl-accounts"],
    enabled: !!allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("gl_accounts").select("*").order("code");
      if (error) throw error;
      return data as GlAccount[];
    },
  });
  const { data: lines, isLoading } = useQuery({
    queryKey: ["gl-lines", to],
    enabled: !!allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gl_lines", { p_to: to });
      if (error) throw error;
      return (data ?? []) as GlLine[];
    },
  });

  if (me && !allowed) return <div className="p-8 text-muted-foreground">Only the Owner, Manager or Accountant can open the books.</div>;

  const accs = accounts ?? [];
  const all = lines ?? [];
  const tb = trialBalance(all, accs);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Accounting</h1>
      <p className="text-muted-foreground">Your books are written automatically from sales, refunds, goods received, payments, expenses and stock changes. Add your own journals for anything else.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div><Label htmlFor="ac-from">From</Label><Input id="ac-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label htmlFor="ac-to">To</Label><Input id="ac-to" type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></div>
        {isLoading && <span className="text-sm text-muted-foreground">Loading…</span>}
      </div>

      <Tabs defaultValue="tb" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="tb">Trial balance</TabsTrigger>
          <TabsTrigger value="pl">Income statement</TabsTrigger>
          <TabsTrigger value="bs">Balance sheet</TabsTrigger>
          <TabsTrigger value="gl">General ledger</TabsTrigger>
          <TabsTrigger value="cb">Cashbook reconciliation</TabsTrigger>
          <TabsTrigger value="rb">Reconciled balances</TabsTrigger>
          <TabsTrigger value="jv">Journals</TabsTrigger>
          <TabsTrigger value="dep">Depreciation</TabsTrigger>
          <TabsTrigger value="coa">Chart of accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="tb"><TrialBalanceTab tb={tb} to={to} /></TabsContent>
        <TabsContent value="pl"><IncomeTab lines={all} accounts={accs} from={from} to={to} /></TabsContent>
        <TabsContent value="bs"><BalanceSheetTab tb={tb} to={to} /></TabsContent>
        <TabsContent value="gl"><LedgerTab lines={all} accounts={accs} from={from} to={to} /></TabsContent>
        <TabsContent value="cb"><CashbookTab lines={all} accounts={accs} from={from} to={to} userId={me?.id} /></TabsContent>
        <TabsContent value="rb"><ReconciledTab accounts={accs} /></TabsContent>
        <TabsContent value="jv"><JournalTab accounts={accs} /></TabsContent>
        <TabsContent value="dep"><DepreciationTab accounts={accs} tb={tb} /></TabsContent>
        <TabsContent value="coa"><AccountsTab accounts={accs} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ExportButtons({ name, title, sub, cols, rows }: { name: string; title: string; sub: string; cols: Col[]; rows: Row[] }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => exportPDF(name, title, sub, cols, rows)}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
      <Button variant="outline" size="sm" onClick={() => exportExcel(name, title.slice(0, 30), cols, rows)}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
    </div>
  );
}

function TrialBalanceTab({ tb, to }: { tb: TbRow[]; to: string }) {
  const dr = tb.reduce((a, r) => a + r.debit, 0), cr = tb.reduce((a, r) => a + r.credit, 0);
  const cols: Col[] = [{ key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "debit", label: "Debit", money: true }, { key: "credit", label: "Credit", money: true }];
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Trial balance as at {to}</h2>
        <ExportButtons name={`trial-balance-${to}`} title="Trial balance" sub={`As at ${to}`} cols={cols} rows={tb.map((r) => ({ code: r.code, name: r.name, debit: r.debit, credit: r.credit }))} />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
        <TableBody>
          {tb.map((r) => (
            <TableRow key={r.code}><TableCell className="tabular">{r.code}</TableCell><TableCell>{r.name}</TableCell>
              <TableCell className="text-right tabular">{r.debit ? money(r.debit) : ""}</TableCell><TableCell className="text-right tabular">{r.credit ? money(r.credit) : ""}</TableCell></TableRow>
          ))}
        </TableBody>
        <TableFooter><TableRow><TableCell colSpan={2}>Totals {Math.abs(dr - cr) < 0.01 ? "— balanced" : "— out by " + money(dr - cr)}</TableCell>
          <TableCell className="text-right tabular">{money(dr)}</TableCell><TableCell className="text-right tabular">{money(cr)}</TableCell></TableRow></TableFooter>
      </Table>
    </section>
  );
}

function IncomeTab({ lines, accounts, from, to }: { lines: GlLine[]; accounts: GlAccount[]; from: string; to: string }) {
  const inRange = lines.filter((l) => l.entry_date >= from && l.entry_date <= to);
  const tb = trialBalance(inRange, accounts);
  const inc = tb.filter((r) => r.type === "income"), exp = tb.filter((r) => r.type === "expense");
  const p = profitFor(lines, accounts, from, to);
  const rows: Row[] = [
    ...inc.map((r) => ({ line: r.name, amount: r.balance })), { line: "Total income", amount: p.income },
    ...exp.map((r) => ({ line: r.name, amount: r.balance })), { line: "Total expenses", amount: p.expense },
    { line: "Net profit", amount: p.profit },
  ];
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Income statement {from} to {to}</h2>
        <ExportButtons name={`income-${from}-${to}`} title="Income statement" sub={`${from} to ${to}`} cols={[{ key: "line", label: "Line" }, { key: "amount", label: "USD", money: true }]} rows={rows} />
      </div>
      <Statement title="Income" rows={inc} total={p.income} />
      <Statement title="Expenses" rows={exp} total={p.expense} />
      <div className="mt-4 flex justify-between border-t pt-3 text-lg font-bold"><span>Net profit</span><span className={`tabular ${p.profit < 0 ? "text-destructive" : ""}`}>{money(p.profit)}</span></div>
    </section>
  );
}

function Statement({ title, rows, total }: { title: string; rows: TbRow[]; total: number }) {
  return (
    <div className="mt-3">
      <h3 className="font-semibold">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      {rows.map((r) => <div key={r.code} className="flex justify-between py-1 text-sm"><span>{r.code} {r.name}</span><span className="tabular">{money(r.balance)}</span></div>)}
      <div className="flex justify-between border-t py-1 font-semibold"><span>Total {title.toLowerCase()}</span><span className="tabular">{money(total)}</span></div>
    </div>
  );
}

function BalanceSheetTab({ tb, to }: { tb: TbRow[]; to: string }) {
  const bs = balanceSheet(tb);
  const assets = assetSchedule(tb);
  const earn: TbRow = { code: "", name: "Current earnings (profit to date)", type: "equity", debit: 0, credit: 0, balance: bs.earnings };
  const rows: Row[] = [
    ...assets.flatMap((a) => a.accRow
      ? [
          { line: `${a.row.name} — cost`, amount: a.row.balance },
          { line: `${a.row.name} — less accumulated depreciation`, amount: -a.acc },
          { line: `${a.row.name} — net book value`, amount: a.nbv },
        ]
      : [{ line: a.row.name, amount: a.row.balance }]),
    { line: "Total assets", amount: bs.totalAssets },
    ...bs.liabilities.map((r) => ({ line: r.name, amount: r.balance })), { line: "Total liabilities", amount: bs.totalLiabilities },
    ...bs.equity.map((r) => ({ line: r.name, amount: r.balance })), { line: earn.name, amount: bs.earnings }, { line: "Total equity", amount: bs.totalEquity },
    { line: "Liabilities + equity", amount: bs.totalLE },
  ];
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Balance sheet as at {to}</h2>
        <ExportButtons name={`balance-sheet-${to}`} title="Balance sheet" sub={`As at ${to}`} cols={[{ key: "line", label: "Line" }, { key: "amount", label: "USD", money: true }]} rows={rows} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mt-3">
            <h3 className="font-semibold">Assets</h3>
            {assets.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            {assets.map((a) => (
              <div key={a.row.code} className="py-1 text-sm">
                {a.accRow ? (
                  <>
                    <div className="flex justify-between"><span>{a.row.code} {a.row.name} — cost</span><span className="tabular">{money(a.row.balance)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span className="pl-4">Less accumulated depreciation</span><span className="tabular">({money(a.acc)})</span></div>
                    <div className="flex justify-between font-medium"><span className="pl-4">Net book value</span><span className="tabular">{money(a.nbv)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span>{a.row.code} {a.row.name}</span><span className="tabular">{money(a.row.balance)}</span></div>
                )}
              </div>
            ))}
            <div className="flex justify-between border-t py-1 font-semibold"><span>Total assets</span><span className="tabular">{money(bs.totalAssets)}</span></div>
          </div>
        </div>
        <div>
          <Statement title="Liabilities" rows={bs.liabilities} total={bs.totalLiabilities} />
          <Statement title="Equity" rows={[...bs.equity, earn]} total={bs.totalEquity} />
          <div className="mt-3 flex justify-between border-t pt-2 font-bold"><span>Liabilities + equity</span><span className="tabular">{money(bs.totalLE)}</span></div>
        </div>
      </div>
      <p className={`mt-4 text-sm ${bs.balanced ? "text-muted-foreground" : "text-destructive"}`}>{bs.balanced ? "Assets equal liabilities plus equity." : "The books don't balance — check recent journals."}</p>
    </section>
  );
}

function LedgerTab({ lines, accounts, from, to }: { lines: GlLine[]; accounts: GlAccount[]; from: string; to: string }) {
  const [acct, setAcct] = useState("1000");
  const name = accounts.find((a) => a.code === acct);
  const { opening, rows } = useMemo(() => {
    const mine = lines.filter((l) => l.account_code === acct).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    const sign = name && (name.type === "asset" || name.type === "expense") ? 1 : -1;
    let bal = mine.filter((l) => l.entry_date < from).reduce((a, l) => a + sign * (Number(l.debit) - Number(l.credit)), 0);
    const opening = bal;
    const rows = mine.filter((l) => l.entry_date >= from && l.entry_date <= to).map((l) => {
      bal += sign * (Number(l.debit) - Number(l.credit));
      return { ...l, balance: Math.round(bal * 100) / 100 };
    });
    return { opening, rows };
  }, [lines, acct, from, to, name]);
  const cols: Col[] = [{ key: "date", label: "Date" }, { key: "type", label: "Type" }, { key: "ref", label: "Reference" }, { key: "memo", label: "Details" }, { key: "debit", label: "Debit", money: true }, { key: "credit", label: "Credit", money: true }, { key: "balance", label: "Balance", money: true }];
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Select value={acct} onValueChange={setAcct}>
          <SelectTrigger className="w-72" aria-label="Account"><SelectValue /></SelectTrigger>
          <SelectContent>{accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent>
        </Select>
        <ExportButtons name={`ledger-${acct}-${from}-${to}`} title={`Ledger ${acct} ${name?.name ?? ""}`} sub={`${from} to ${to}`} cols={cols}
          rows={rows.map((r) => ({ date: r.entry_date, type: SOURCE_LABEL[r.source] ?? r.source, ref: r.reference, memo: r.memo, debit: Number(r.debit), credit: Number(r.credit), balance: r.balance }))} />
      </div>
      <p className="mb-2 text-sm">Opening balance on {from}: <span className="tabular font-semibold">{money(opening)}</span></p>
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No entries in these dates.</TableCell></TableRow>}
          {rows.slice(-500).map((r, i) => (
            <TableRow key={i}><TableCell className="tabular">{r.entry_date}</TableCell><TableCell>{SOURCE_LABEL[r.source] ?? r.source}</TableCell><TableCell>{r.reference}</TableCell><TableCell className="max-w-56 truncate">{r.memo}</TableCell>
              <TableCell className="text-right tabular">{Number(r.debit) ? money(Number(r.debit)) : ""}</TableCell><TableCell className="text-right tabular">{Number(r.credit) ? money(Number(r.credit)) : ""}</TableCell><TableCell className="text-right tabular">{money(r.balance)}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

type JLine = { account: string; debit: string; credit: string };
function JournalTab({ accounts }: { accounts: GlAccount[] }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [jl, setJl] = useState<JLine[]>([{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }]);
  const [busy, setBusy] = useState(false);
  const active = accounts.filter((a) => a.active);
  const check = journalBalanced(jl.map((l) => ({ debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })));

  const { data: entries } = useQuery({
    queryKey: ["journals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_entries").select("*, journal_lines(*)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  async function post() {
    setBusy(true);
    const lines = jl.filter((l) => l.account && (Number(l.debit) || Number(l.credit))).map((l) => ({ account: l.account, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }));
    const { data, error } = await supabase.rpc("post_journal", { p_date: date, p_memo: memo, p_lines: lines });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Journal ${data} posted`);
    setMemo(""); setJl([{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }]);
    qc.invalidateQueries({ queryKey: ["journals"] });
    qc.invalidateQueries({ queryKey: ["gl-lines"] });
  }
  const set = (i: number, p: Partial<JLine>) => setJl(jl.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const name = (c: string) => accounts.find((a) => a.code === c)?.name ?? c;

  return (
    <div className="mt-4 space-y-6">
      <section className="rounded-xl border bg-card p-4 shadow-soft">
        <h2 className="text-lg font-semibold">New journal</h2>
        <p className="text-sm text-muted-foreground">For things the till doesn't record: money the owner puts in or takes out, loans, equipment bought, opening balances.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
          <div><Label htmlFor="jv-date">Date</Label><Input id="jv-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label htmlFor="jv-memo">Description</Label><Input id="jv-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Owner put in starting capital" /></div>
        </div>
        <div className="mt-3 space-y-2">
          {jl.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px_40px] gap-2">
              <Select value={l.account} onValueChange={(v) => set(i, { account: v })}>
                <SelectTrigger aria-label={`Account for line ${i + 1}`}><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>{active.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input aria-label={`Debit for line ${i + 1}`} inputMode="decimal" placeholder="Debit" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
              <Input aria-label={`Credit for line ${i + 1}`} inputMode="decimal" placeholder="Credit" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
              <Button variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={jl.length <= 2} onClick={() => setJl(jl.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setJl([...jl, { account: "", debit: "", credit: "" }])}><Plus className="mr-1 h-4 w-4" />Add line</Button>
          <span className={`text-sm tabular ${check.ok ? "text-muted-foreground" : "text-destructive"}`}>Debits {money(check.dr)} · Credits {money(check.cr)}</span>
          <Button onClick={post} disabled={!check.ok || !memo.trim() || busy}>Post journal</Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-soft">
        <h2 className="mb-2 text-lg font-semibold">Posted journals</h2>
        {(entries ?? []).length === 0 && <p className="text-sm text-muted-foreground">No journals yet.</p>}
        {(entries ?? []).map((e) => (
          <div key={e.id} className="border-t py-2 text-sm">
            <div className="flex justify-between font-medium"><span>{e.journal_number} · {e.memo}</span><span className="tabular text-muted-foreground">{e.entry_date}</span></div>
            {e.journal_lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_100px_100px] text-muted-foreground">
                <span className={Number(l.credit) ? "pl-6" : ""}>{l.account_code} {name(l.account_code)}</span>
                <span className="text-right tabular">{Number(l.debit) ? money(Number(l.debit)) : ""}</span>
                <span className="text-right tabular">{Number(l.credit) ? money(Number(l.credit)) : ""}</span>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function AccountsTab({ accounts }: { accounts: GlAccount[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: "", name: "", type: "expense" as AccountType });
  async function save(code: string, name: string, type: AccountType, active: boolean) {
    const { error } = await supabase.rpc("save_gl_account", { p_code: code, p_name: name, p_type: type, p_active: active });
    if (error) { toast.error(error.message); return false; }
    qc.invalidateQueries({ queryKey: ["gl-accounts"] });
    return true;
  }
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await save(f.code, f.name, f.type, true)) { toast.success("Account added"); setF({ ...f, code: "", name: "" }); } }}>
        <div><Label htmlFor="coa-code">Code</Label><Input id="coa-code" className="w-24" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></div>
        <div className="flex-1"><Label htmlFor="coa-name">Account name</Label><Input id="coa-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
        <div><Label>Type</Label>
          <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as AccountType })}>
            <SelectTrigger className="w-40" aria-label="Account type"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button type="submit"><Plus className="mr-1 h-4 w-4" />Add account</Button>
      </form>
      {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
        <div key={t} className="mb-4">
          <h3 className="font-semibold">{TYPE_LABEL[t]}</h3>
          {accounts.filter((a) => a.type === t).map((a) => (
            <div key={a.code} className="flex items-center justify-between border-t py-1.5 text-sm">
              <span className={a.active ? "" : "text-muted-foreground line-through"}>{a.code} {a.name}{a.system && <span className="ml-2 text-xs text-muted-foreground">(automatic)</span>}</span>
              {!a.system && <Button variant="ghost" size="sm" onClick={() => save(a.code, a.name, a.type, !a.active)}>{a.active ? "Switch off" : "Switch on"}</Button>}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

const lineKey = (l: GlLine) => [l.entry_date, l.source, l.reference, l.memo, Number(l.debit), Number(l.credit)].join("|");
function CashbookTab({ lines, accounts, from, to, userId }: { lines: GlLine[]; accounts: GlAccount[]; from: string; to: string; userId?: string | undefined }) {
  const qc = useQueryClient();
  const [acct, setAcct] = useState("1000");
  const [stmt, setStmt] = useState("");
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { data: saved } = useQuery({
    queryKey: ["cashbook-rec", acct, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("cashbook_reconciliations").select("*").eq("account_code", acct).eq("statement_date", to).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: prevCleared } = useQuery({
    queryKey: ["cashbook-cleared", acct],
    queryFn: async () => {
      const { data, error } = await supabase.from("cashbook_reconciliations").select("cleared").eq("account_code", acct);
      if (error) throw error;
      return new Set((data ?? []).flatMap((r) => (r.cleared as string[]) ?? []));
    },
  });
  const loadedFor = useRef("");
  useEffect(() => {
    const k = `${acct}|${to}`;
    if (saved === undefined || !prevCleared || loadedFor.current === k) return;
    loadedFor.current = k;
    setCleared(new Set(saved ? (saved.cleared as string[]) : prevCleared));
    setStmt(saved ? String(saved.statement_balance) : "");
  }, [saved, prevCleared, acct, to]);
  const cashAccts = accounts.filter((a) => a.type === "asset" && a.code !== "1100" && a.code !== "1200");
  const { opening, rows, closing } = useMemo(() => {
    const mine = lines.filter((l) => l.account_code === acct).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    const opening = mine.filter((l) => l.entry_date < from).reduce((a, l) => a + Number(l.debit) - Number(l.credit), 0);
    const rows = mine.filter((l) => l.entry_date >= from && l.entry_date <= to);
    const closing = opening + rows.reduce((a, l) => a + Number(l.debit) - Number(l.credit), 0);
    return { opening: Math.round(opening * 100) / 100, rows, closing: Math.round(closing * 100) / 100 };
  }, [lines, acct, from, to]);
  const unclearedIn = rows.reduce((a, l, i) => a + (cleared.has(lineKey(l)) ? 0 : Number(l.debit)), 0);
  const unclearedOut = rows.reduce((a, l, i) => a + (cleared.has(lineKey(l)) ? 0 : Number(l.credit)), 0);
  const statement = Number(stmt) || 0;
  const adjusted = Math.round((statement + unclearedIn - unclearedOut) * 100) / 100;
  const diff = Math.round((closing - adjusted) * 100) / 100;
  const toggle = (k: string) => { const n = new Set(cleared); if (n.has(k)) n.delete(k); else n.add(k); setCleared(n); };
  async function save() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("cashbook_reconciliations").upsert({ account_code: acct, statement_date: to, statement_balance: statement, cashbook_balance: closing, difference: diff, cleared: [...cleared], reconciled_by: userId, updated_at: new Date().toISOString() }, { onConflict: "store_id,account_code,statement_date" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(diff === 0 ? "Reconciliation saved — balanced" : "Reconciliation saved");
    qc.invalidateQueries({ queryKey: ["cashbook-rec"] }); qc.invalidateQueries({ queryKey: ["cashbook-cleared"] }); qc.invalidateQueries({ queryKey: ["cashbook-recs"] });
  }
  const cols: Col[] = [{ key: "date", label: "Date" }, { key: "ref", label: "Reference" }, { key: "memo", label: "Details" }, { key: "in", label: "Money in", money: true }, { key: "out", label: "Money out", money: true }, { key: "status", label: "Status" }];
  const exp: Row[] = [
    ...rows.map((r, i) => ({ date: r.entry_date, ref: r.reference, memo: r.memo, in: Number(r.debit), out: Number(r.credit), status: cleared.has(lineKey(r)) ? "Cleared" : "Not cleared" })),
    { date: "", ref: "", memo: "Cashbook balance", in: closing, out: 0, status: "" },
    { date: "", ref: "", memo: "Statement / counted balance", in: statement, out: 0, status: "" },
    { date: "", ref: "", memo: "Difference", in: diff, out: 0, status: diff === 0 ? "Reconciled" : "Not reconciled" },
  ];
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>Cashbook</Label>
            <Select value={acct} onValueChange={(v) => setAcct(v)}>
              <SelectTrigger className="w-64" aria-label="Cashbook account"><SelectValue /></SelectTrigger>
              <SelectContent>{cashAccts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="cb-stmt">Bank statement / cash counted on {to}</Label><Input id="cb-stmt" inputMode="decimal" className="w-48" value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder="0.00" /></div>
        </div>
        <ExportButtons name={`cashbook-rec-${acct}-${to}`} title={`Cashbook reconciliation ${acct}`} sub={`${from} to ${to}`} cols={cols} rows={exp} />
      </div>
      <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
        <div className="flex justify-between"><span>Opening balance ({from})</span><span className="tabular">{money(opening)}</span></div>
        <div className="flex justify-between"><span>Cashbook balance ({to})</span><span className="tabular font-semibold">{money(closing)}</span></div>
        <div className="flex justify-between"><span>Statement / counted balance</span><span className="tabular">{money(statement)}</span></div>
        <div className="flex justify-between"><span>Add: money in not yet cleared</span><span className="tabular">{money(unclearedIn)}</span></div>
        <div className="flex justify-between"><span>Less: money out not yet cleared</span><span className="tabular">{money(unclearedOut)}</span></div>
        <div className="flex justify-between"><span>Adjusted statement balance</span><span className="tabular">{money(adjusted)}</span></div>
        <div className={`flex justify-between font-bold sm:col-span-2 ${diff === 0 ? "" : "text-destructive"}`}><span>{diff === 0 ? "Reconciled" : "Difference to investigate"}</span><span className="tabular">{money(diff)}</span></div>
      </div>
      <p className="my-2 text-sm text-muted-foreground">Tick each entry that appears on your bank statement or was counted in cash.</p>
      <Table>
        <TableHeader><TableRow><TableHead>Cleared</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Money in</TableHead><TableHead className="text-right">Money out</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No entries in these dates.</TableCell></TableRow>}
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell><input type="checkbox" aria-label={`Cleared ${r.reference}`} className="h-4 w-4" checked={cleared.has(lineKey(r))} onChange={() => toggle(lineKey(r))} /></TableCell>
              <TableCell className="tabular">{r.entry_date}</TableCell><TableCell>{SOURCE_LABEL[r.source] ?? r.source}</TableCell><TableCell>{r.reference}</TableCell><TableCell className="max-w-56 truncate">{r.memo}</TableCell>
              <TableCell className="text-right tabular">{Number(r.debit) ? money(Number(r.debit)) : ""}</TableCell><TableCell className="text-right tabular">{Number(r.credit) ? money(Number(r.credit)) : ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-2 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setCleared(new Set([...cleared, ...rows.map(lineKey)]))}>Tick all</Button>
        <Button variant="outline" size="sm" onClick={() => { const n = new Set(cleared); rows.forEach((r) => n.delete(lineKey(r))); setCleared(n); }}>Clear ticks</Button>
        <Button size="sm" className="ml-auto" onClick={save} disabled={saving || !userId}>{saving ? "Saving…" : "Save reconciliation"}</Button>
      </div>
    </section>
  );
}

function ReconciledTab({ accounts }: { accounts: GlAccount[] }) {
  const { data } = useQuery({
    queryKey: ["cashbook-recs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cashbook_reconciliations").select("*").order("statement_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const recs = data ?? [];
  const { data: people } = useQuery({
    queryKey: ["rec-people", recs.map((r) => r.reconciled_by).join()],
    enabled: recs.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", [...new Set(recs.map((r) => r.reconciled_by))]);
      return new Map((data ?? []).map((p) => [p.id, p.full_name]));
    },
  });
  const acctName = (c: string) => accounts.find((a) => a.code === c)?.name ?? c;
  const cols: Col[] = [{ key: "date", label: "Statement date" }, { key: "acct", label: "Account" }, { key: "book", label: "Cashbook", money: true }, { key: "stmt", label: "Statement", money: true }, { key: "diff", label: "Difference", money: true }, { key: "items", label: "Cleared items" }, { key: "by", label: "By" }];
  const rows: Row[] = recs.map((r) => ({ date: r.statement_date, acct: `${r.account_code} ${acctName(r.account_code)}`, book: Number(r.cashbook_balance), stmt: Number(r.statement_balance), diff: Number(r.difference), items: String((r.cleared as string[]).length), by: people?.get(r.reconciled_by) ?? "" }));
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Reconciled balances</h2>
        <ExportButtons name="reconciled-balances" title="Reconciled balances" sub="Saved cashbook reconciliations" cols={cols} rows={rows} />
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Statement date</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Cashbook</TableHead><TableHead className="text-right">Statement</TableHead><TableHead className="text-right">Difference</TableHead><TableHead>Status</TableHead><TableHead>By</TableHead><TableHead>Saved</TableHead></TableRow></TableHeader>
        <TableBody>
          {recs.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">No saved reconciliations yet.</TableCell></TableRow>}
          {recs.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular">{r.statement_date}</TableCell><TableCell>{r.account_code} {acctName(r.account_code)}</TableCell>
              <TableCell className="text-right tabular">{money(Number(r.cashbook_balance))}</TableCell><TableCell className="text-right tabular">{money(Number(r.statement_balance))}</TableCell>
              <TableCell className={`text-right tabular ${Number(r.difference) ? "text-destructive" : ""}`}>{money(Number(r.difference))}</TableCell>
              <TableCell>{Number(r.difference) ? "Not reconciled" : "Reconciled"}</TableCell>
              <TableCell>{people?.get(r.reconciled_by) ?? ""}</TableCell><TableCell className="tabular text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function DepreciationTab({ accounts, tb }: { accounts: GlAccount[]; tb: TbRow[] }) {
  const qc = useQueryClient();
  const assets = accounts.filter((a) => a.type === "asset" && !a.system && !a.code.endsWith("-AD"));
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [rates, setRates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { data: cfg } = useQuery({
    queryKey: ["asset-depreciation"],
    queryFn: async () => {
      const { data, error } = await supabase.from("asset_depreciation").select("*");
      if (error) throw error;
      return data;
    },
  });
  const bal = (c: string) => tb.find((r) => r.code === c)?.balance ?? 0;
  async function save(code: string) {
    const v = rates[code] ?? "";
    const { error } = await supabase.rpc("set_asset_depreciation", { p_code: code, p_rate: Number(v) || 0 });
    if (error) { toast.error(error.message); return; }
    toast.success("Depreciation rate saved");
    qc.invalidateQueries({ queryKey: ["asset-depreciation"] });
  }
  async function run() {
    setBusy(true);
    const { data, error } = await supabase.rpc("run_depreciation", { p_year: Number(year) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(data ? `Depreciation posted for ${data} asset(s)` : "Nothing to post for that year");
    qc.invalidateQueries({ queryKey: ["asset-depreciation"] });
    qc.invalidateQueries({ queryKey: ["journals"] });
    qc.invalidateQueries({ queryKey: ["gl-lines"] });
    qc.invalidateQueries({ queryKey: ["gl-accounts"] });
  }
  return (
    <section className="mt-4 rounded-xl border bg-card p-4 shadow-soft">
      <h2 className="text-lg font-semibold">Asset depreciation (per annum)</h2>
      <p className="text-sm text-muted-foreground">Set a yearly rate for each asset. Running a year posts straight-line depreciation (cost × rate) to Depreciation expense and the asset's Accumulated depreciation. Each year can only be posted once per asset, and an asset never goes below zero.</p>
      {assets.length === 0 && <p className="mt-3 text-sm">Add an asset account in Chart of accounts first.</p>}
      <Table className="mt-3">
        <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Accumulated</TableHead><TableHead className="text-right">Book value</TableHead><TableHead>Rate % p.a.</TableHead><TableHead>Last year posted</TableHead></TableRow></TableHeader>
        <TableBody>
          {assets.map((a) => {
            const c = cfg?.find((x) => x.account_code === a.code);
            const cost = bal(a.code), acc = -bal(`${a.code}-AD`);
            return (
              <TableRow key={a.code}>
                <TableCell>{a.code} {a.name}</TableCell>
                <TableCell className="text-right tabular">{money(cost)}</TableCell>
                <TableCell className="text-right tabular">{money(acc)}</TableCell>
                <TableCell className="text-right tabular">{money(cost - acc)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Input aria-label={`Rate for ${a.name}`} className="w-20" inputMode="decimal" placeholder="e.g. 10" value={rates[a.code] ?? (c ? String(c.rate) : "")} onChange={(e) => setRates({ ...rates, [a.code]: e.target.value })} />
                    <Button size="sm" variant="outline" onClick={() => save(a.code)}>Save</Button>
                  </div>
                </TableCell>
                <TableCell>{c?.last_year ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div><Label htmlFor="dep-year">Year</Label><Input id="dep-year" className="w-28" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></div>
        <Button onClick={run} disabled={busy || !cfg?.length}>Post depreciation for {year}</Button>
      </div>
    </section>
  );
}
