export type SettleGroup = "cash" | "other" | "account";
export interface SourceLine { kind: "sale" | "refund" | "repayment" | "paid_in" | "paid_out" | "cash_drop"; ref: string; at: string; cashier: string; method: string; usd: number }
export interface MethodRow { method: string; label: string; group: SettleGroup; sales: number; repayments: number; refunds: number; movements: number; expected: number; sources: SourceLine[] }

type Type = { code: string; name: string; is_cash: boolean; is_account?: boolean };
interface Input {
  types: Type[];
  sales: { id: string; sale_number: string; created_at: string; cashier: string; change_given: number; status?: string; payments: { method: string; amount: number; exchange_rate: number }[] }[];
  refunds: { id: string; created_at: string; cashier: string; method: string; amount: number }[];
  repayments: { payment_number: string; created_at: string; cashier: string; method: string; amount: number }[];
  movements: { id: string; created_at: string; cashier: string; type: string; usd: number; reason?: string | null }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Expected takings per payment type for one day, with every source line that makes up each amount. */
export function buildSettlement(input: Input): MethodRow[] {
  const typeOf = (code: string) => input.types.find((t) => t.code === code);
  const cashCode = input.types.find((t) => t.is_cash)?.code ?? "cash";
  const rows = new Map<string, MethodRow>();
  const row = (method: string) => {
    let r = rows.get(method);
    if (!r) {
      const t = typeOf(method);
      r = { method, label: t?.name ?? method, group: t?.is_account ? "account" : t?.is_cash || (!t && method === "cash") ? "cash" : "other", sales: 0, repayments: 0, refunds: 0, movements: 0, expected: 0, sources: [] };
      rows.set(method, r);
    }
    return r;
  };
  for (const s of input.sales) {
    if (s.status && s.status !== "completed" && s.status !== "refunded" && s.status !== "partially_refunded") continue;
    const per = new Map<string, number>();
    for (const p of s.payments) per.set(p.method, (per.get(p.method) ?? 0) + Number(p.amount) / (Number(p.exchange_rate) || 1));
    const change = Number(s.change_given) || 0;
    if (change) {
      const cashKey = [...per.keys()].find((m) => typeOf(m)?.is_cash || m === cashCode) ?? cashCode;
      per.set(cashKey, (per.get(cashKey) ?? 0) - change);
    }
    for (const [m, usd] of per) {
      const r = row(m);
      r.sales += usd;
      r.sources.push({ kind: "sale", ref: s.sale_number, at: s.created_at, cashier: s.cashier, method: m, usd: r2(usd) });
    }
  }
  for (const p of input.repayments) {
    const r = row(p.method);
    r.repayments += Number(p.amount);
    r.sources.push({ kind: "repayment", ref: p.payment_number, at: p.created_at, cashier: p.cashier, method: p.method, usd: r2(Number(p.amount)) });
  }
  for (const f of input.refunds) {
    const r = row(f.method);
    r.refunds += Number(f.amount);
    r.sources.push({ kind: "refund", ref: `Refund ${f.id.slice(0, 8)}`, at: f.created_at, cashier: f.cashier, method: f.method, usd: -r2(Number(f.amount)) });
  }
  for (const m of input.movements) {
    // Debt payments in cash also log a drawer paid-in; they're already counted as repayments.
    if (m.type === "paid_in" && (m.reason ?? "").startsWith("Debt payment from")) continue;
    // Bottle deposits are not sales, but their cash remains in the drawer until refunded.
    const r = row(cashCode);
    const signed = m.type === "paid_in" ? m.usd : -m.usd;
    r.movements += signed;
    r.sources.push({ kind: m.type as SourceLine["kind"], ref: m.type.replace("_", " "), at: m.created_at, cashier: m.cashier, method: cashCode, usd: r2(signed) });
  }
  const order: SettleGroup[] = ["cash", "other", "account"];
  return [...rows.values()].map((r) => {
    r.sales = r2(r.sales); r.repayments = r2(r.repayments); r.refunds = r2(r.refunds); r.movements = r2(r.movements);
    r.expected = r2(r.sales + r.repayments - r.refunds + r.movements);
    r.sources.sort((a, b) => a.at.localeCompare(b.at));
    return r;
  }).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.label.localeCompare(b.label));
}

export function groupTotals(rows: MethodRow[]) {
  const t = { cash: 0, other: 0, account: 0 };
  for (const r of rows) t[r.group] = r2(t[r.group] + r.expected);
  return t;
}
