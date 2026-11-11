import { assetSchedule, type GlAccount, type TbRow } from "./ledger";

export interface AssetMetadata { account_code: string; purchase_date: string | null }
export interface AssetRate { account_code: string; rate: number; start_date: string | null }

export function assetRegisterRows(accounts: GlAccount[], tb: TbRow[], metadata: AssetMetadata[], rates: AssetRate[]) {
  const balances = new Map(assetSchedule(tb).map((a) => [a.row.code, a]));
  return accounts.filter((a) => a.type === "asset" && !a.system && !a.code.endsWith("-AD")).map((a) => {
    const balance = balances.get(a.code);
    const depreciation = rates.find((r) => r.account_code === a.code);
    return {
      code: a.code, name: a.name, active: a.active,
      purchaseDate: metadata.find((m) => m.account_code === a.code)?.purchase_date ?? null,
      startDate: depreciation?.start_date ?? null, rate: depreciation?.rate ?? null,
      cost: balance?.row.balance ?? 0, accumulated: balance?.acc ?? 0, bookValue: balance?.nbv ?? 0,
    };
  });
}