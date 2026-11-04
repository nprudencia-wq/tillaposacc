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

export function journalBalanced(lines: { debit: number; credit: number }[]) {
  const dr = r2(lines.reduce((a, l) => a + (l.debit || 0), 0));
  const cr = r2(lines.reduce((a, l) => a + (l.credit || 0), 0));
  return { dr, cr, ok: dr > 0 && dr === cr && lines.filter((l) => l.debit || l.credit).length >= 2 };
}
