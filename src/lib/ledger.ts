export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export interface GlAccount { code: string; name: string; type: AccountType; system: boolean; active: boolean }
export interface GlLine { entry_date: string; source: string; reference: string; memo: string; account_code: string; debit: number; credit: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Assets and expenses grow with debits; liabilities, equity and income grow with credits. */
export const debitNormal = (t: AccountType) => t === "asset" || t === "expense";

export interface TbRow { code: string; name: string; type: AccountType; debit: number; credit: number; balance: number }

/** Closing balances of every account from all lines up to the end date. */
export function trialBalance(lines: GlLine[], accounts: GlAccount[]): TbRow[] {
  const sums = new Map<string, { dr: number; cr: number }>();
  for (const l of lines) {
    const s = sums.get(l.account_code) ?? { dr: 0, cr: 0 };
    s.dr += Number(l.debit); s.cr += Number(l.credit);
    sums.set(l.account_code, s);
  }
  return accounts
    .map((a) => {
      const s = sums.get(a.code) ?? { dr: 0, cr: 0 };
      const net = r2(s.dr - s.cr);
      return { code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, balance: debitNormal(a.type) ? net : -net };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);
}

/** Profit for a date range: income minus expenses, using only lines inside it. */
export function profitFor(lines: GlLine[], accounts: GlAccount[], from: string, to: string) {
  const type = new Map(accounts.map((a) => [a.code, a.type]));
  let income = 0, expense = 0;
  for (const l of lines) {
    if (l.entry_date < from || l.entry_date > to) continue;
    const t = type.get(l.account_code);
    if (t === "income") income += Number(l.credit) - Number(l.debit);
    if (t === "expense") expense += Number(l.debit) - Number(l.credit);
  }
  return { income: r2(income), expense: r2(expense), profit: r2(income - expense) };
}

/** Balance sheet as at the end date; all-time profit not yet closed off shows as current earnings in equity. */
export function balanceSheet(tb: TbRow[]) {
  const pick = (t: AccountType) => tb.filter((r) => r.type === t);
  const sum = (rs: TbRow[]) => r2(rs.reduce((a, r) => a + r.balance, 0));
  const assets = pick("asset"), liabilities = pick("liability"), equity = pick("equity");
  const earnings = r2(sum(pick("income")) - sum(pick("expense")));
  const totalAssets = sum(assets);
  const totalLE = r2(sum(liabilities) + sum(equity) + earnings);
  return { assets, liabilities, equity, earnings, totalAssets, totalLiabilities: sum(liabilities), totalEquity: r2(sum(equity) + earnings), totalLE, balanced: Math.abs(totalAssets - totalLE) < 0.01 };
}

export interface AssetLine { row: TbRow; accRow: TbRow | null; acc: number; nbv: number }
/** Pairs each asset with its "-AD" accumulated-depreciation contra account, so reports show cost, accumulated depreciation and net book value. */
export function assetSchedule(tb: TbRow[]): AssetLine[] {
  const ads = new Map(tb.filter((r) => r.type === "asset" && r.code.endsWith("-AD")).map((r) => [r.code, r]));
  return tb
    .filter((r) => r.type === "asset" && !r.code.endsWith("-AD"))
    .map((r) => {
      const accRow = ads.get(`${r.code}-AD`) ?? null;
      const acc = accRow ? r2(-accRow.balance) : 0;
      return { row: r, accRow, acc, nbv: r2(r.balance - acc) };
    });
}

export function journalBalanced(lines: { debit: number; credit: number }[]) {
  const dr = r2(lines.reduce((a, l) => a + (l.debit || 0), 0));
  const cr = r2(lines.reduce((a, l) => a + (l.credit || 0), 0));
  return { dr, cr, ok: dr > 0 && dr === cr && lines.filter((l) => l.debit || l.credit).length >= 2 };
}

export const CASH_CODES = ["1000", "1010"];
export interface CashFlowLine { code: string; name: string; amount: number }
export interface CashFlow {
  profit: number; adjustments: CashFlowLine[]; operating: number;
  investing: CashFlowLine[]; investingTotal: number; financing: CashFlowLine[]; financingTotal: number;
  opening: number; netChange: number; closing: number;
}
/**
 * Indirect cash flow for a date range. Each non-cash account's effect on cash is −(debits − credits) in range:
 * depreciation and system accounts (debtors, stock, payables) are operating; own asset accounts are investing;
 * equity and own liabilities (loans) are financing. Because every entry balances, the net change equals the cash account movement.
 */
export function cashFlow(lines: GlLine[], accounts: GlAccount[], from: string, to: string): CashFlow {
  const acc = new Map(accounts.map((a) => [a.code, a]));
  const move = new Map<string, number>();
  let opening = 0, closing = 0;
  for (const l of lines) {
    const net = Number(l.debit) - Number(l.credit);
    if (CASH_CODES.includes(l.account_code)) {
      if (l.entry_date < from) opening += net;
      if (l.entry_date <= to) closing += net;
      continue;
    }
    if (l.entry_date < from || l.entry_date > to) continue;
    move.set(l.account_code, (move.get(l.account_code) ?? 0) + net);
  }
  const p = profitFor(lines, accounts, from, to);
  const adjustments: CashFlowLine[] = [], investing: CashFlowLine[] = [], financing: CashFlowLine[] = [];
  for (const [code, net] of [...move].sort(([a], [b]) => a.localeCompare(b))) {
    const a = acc.get(code);
    const t = a?.type;
    if (t === "income" || t === "expense") continue;
    const line = { code, name: a?.name ?? code, amount: r2(-net) };
    if (line.amount === 0) continue;
    if (code.endsWith("-AD") || (t === "asset" && a?.system) || (t === "liability" && a?.system) || !a) adjustments.push(line);
    else if (t === "asset") investing.push(line);
    else financing.push(line);
  }
  const sum = (x: CashFlowLine[]) => r2(x.reduce((s, l) => s + l.amount, 0));
  const operating = r2(p.profit + sum(adjustments));
  const investingTotal = sum(investing), financingTotal = sum(financing);
  return { profit: p.profit, adjustments, operating, investing, investingTotal, financing, financingTotal,
    opening: r2(opening), netChange: r2(operating + investingTotal + financingTotal), closing: r2(closing) };
}
