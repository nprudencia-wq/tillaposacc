import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assetRegisterRows } from "@/lib/asset-register";
import { trialBalance, type GlAccount, type GlLine } from "@/lib/ledger";
import { money } from "@/lib/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AssetRegister({ accounts, onDepreciation, onAddAsset }: { accounts: GlAccount[]; onDepreciation: (code: string) => void; onAddAsset: () => void }) {
  const qc = useQueryClient();
  const asOf = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const metadata = useQuery({ queryKey: ["asset-register"], queryFn: async () => {
    const { data, error } = await supabase.from("asset_register").select("*");
    if (error) throw error;
    return data ?? [];
  } });
  const rates = useQuery({ queryKey: ["asset-depreciation"], queryFn: async () => {
    const { data, error } = await supabase.from("asset_depreciation").select("*");
    if (error) throw error;
    return data ?? [];
  } });
  const ledger = useQuery({ queryKey: ["gl-lines", asOf], queryFn: async () => {
    const { data, error } = await supabase.rpc("gl_lines", { p_to: asOf });
    if (error) throw error;
    return (data ?? []) as GlLine[];
  } });
  const rows = assetRegisterRows(accounts, trialBalance(ledger.data ?? [], accounts), metadata.data ?? [], rates.data ?? []);
  async function save(code: string, date: string) {
    if (!date) { toast.error("Enter the asset purchase date"); return; }
    setSaving(code);
    try {
      const { error } = await supabase.rpc("save_asset_purchase_date", { p_code: code, p_purchase_date: date });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["asset-register"] });
      setDates((prev) => { const next = { ...prev }; delete next[code]; return next; });
      toast.success("Asset purchase date saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save purchase date"); }
    finally { setSaving(null); }
  }
  const error = metadata.error ?? rates.error ?? ledger.error;
  return <section className="mt-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Asset register</h2><p className="text-sm text-muted-foreground">Current balances as at {asOf} · USD</p></div>
      <Button variant="outline" onClick={onAddAsset}>Add asset account<ArrowRight className="ml-2 h-4 w-4" /></Button>
    </div>
    {error ? <p role="alert" className="text-destructive">{error.message}</p> : metadata.isPending || rates.isPending || ledger.isPending ? <p className="text-muted-foreground">Loading assets…</p> : <>
      {!rows.length && <p className="text-muted-foreground">No asset accounts yet.</p>}
      <Table>
        <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Purchase date</TableHead><TableHead>First used</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Rate % p.a.</TableHead><TableHead className="text-right">Accumulated depreciation</TableHead><TableHead className="text-right">Current book value</TableHead><TableHead>Depreciation</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((a) => {
          const date = dates[a.code] ?? a.purchaseDate ?? "";
          return <TableRow key={a.code}>
            <TableCell className="min-w-40"><span className="font-medium">{a.code} {a.name}</span>{!a.active && <span className="block text-xs text-muted-foreground">Inactive</span>}</TableCell>
            <TableCell><div className="flex items-center gap-2"><Input type="date" className="w-40" aria-label={`Purchase date for ${a.name}`} value={date} onChange={(e) => setDates((prev) => ({ ...prev, [a.code]: e.target.value }))} /><Button size="icon" variant="outline" aria-label={`Save purchase date for ${a.name}`} title="Save purchase date" disabled={saving !== null || date === (a.purchaseDate ?? "")} onClick={() => save(a.code, date)}><Save className="h-4 w-4" /></Button></div></TableCell>
            <TableCell className="whitespace-nowrap">{a.startDate ?? "Not set"}</TableCell>
            <TableCell className="text-right tabular whitespace-nowrap">{money(a.cost)}</TableCell>
            <TableCell className="text-right tabular">{a.rate == null ? "Not set" : `${a.rate}%`}</TableCell>
            <TableCell className="text-right tabular whitespace-nowrap">{money(a.accumulated)}</TableCell>
            <TableCell className="text-right tabular whitespace-nowrap font-semibold">{money(a.bookValue)}</TableCell>
            <TableCell><Button variant="ghost" size="sm" onClick={() => onDepreciation(a.code)} aria-label={`Depreciation for ${a.name}`}>Manage<ArrowRight className="ml-2 h-4 w-4" /></Button></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </>}
  </section>;
}