import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Calculator, CheckCircle2, LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildCashUp, parseCashCounts, type CashCounts, type CashCountInputs } from "@/lib/cash-up";
import { money, type Currency } from "@/lib/pos";
import type { ShiftSummary } from "@/components/Shift";

type Props = {
  shiftId: string;
  loadSummary: (shiftId: string) => Promise<ShiftSummary>;
  onClose: () => void;
  onRecordMovement: () => void;
  onCloseShift: (counts: CashCounts) => void;
};

export function CashUpDialog({ shiftId, loadSummary, onClose, onRecordMovement, onCloseShift }: Props) {
  const [counts, setCounts] = useState<CashCountInputs>({ usd: "", zig: "", zar: "" });
  const { data: summary, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["till-cash-up", shiftId],
    queryFn: () => loadSummary(shiftId),
    refetchOnMount: "always",
  });

  useEffect(() => {
    const refresh = () => { void refetch(); };
    for (const event of ["tilla-sale", "tilla-sync", "tilla-queue"]) window.addEventListener(event, refresh);
    return () => { for (const event of ["tilla-sale", "tilla-sync", "tilla-queue"]) window.removeEventListener(event, refresh); };
  }, [refetch]);

  const parsed = parseCashCounts(counts);
  const counted = {
    USD: counts.usd.trim() === "" ? null : Number(counts.usd),
    ZiG: counts.zig.trim() === "" ? null : Number(counts.zig),
    ZAR: counts.zar.trim() === "" ? null : Number(counts.zar),
  };
  const rows = summary ? buildCashUp(summary, counted) : [];
  const setCount = (key: keyof CashCountInputs, value: string) => setCounts((old) => ({ ...old, [key]: value }));

  function fillExpected() {
    const next = { usd: "0.00", zig: "0.00", zar: "0.00" };
    for (const row of rows) next[row.currency === "USD" ? "usd" : row.currency === "ZiG" ? "zig" : "zar"] = row.expected.toFixed(2);
    setCounts(next);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 bg-sidebar p-4 pr-12 text-sidebar-foreground sm:px-6">
          <DialogTitle className="flex items-center gap-2 font-display text-xl"><Calculator className="h-5 w-5" />Cash-up</DialogTitle>
          <p className="text-sm text-sidebar-foreground/75">
            {summary ? `${summary.shift.shift_number} · Count the drawer and check every cash movement.` : "Loading this shift’s cash totals…"}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading && <div className="grid min-h-48 place-items-center text-muted-foreground"><LoaderCircle className="h-7 w-7 animate-spin" /><span className="sr-only">Loading cash-up</span></div>}
          {error && <div className="mx-auto max-w-md space-y-3 py-10 text-center"><p className="font-semibold text-destructive">Cash totals are unavailable</p><p className="text-sm text-muted-foreground">{error.message}</p><Button variant="outline" onClick={() => void refetch()}><RefreshCw className="h-4 w-4" />Try again</Button></div>}
          {summary && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm">
                <p className="max-w-3xl text-muted-foreground">Cash sales and drawer movements match Back Office Daily settlement. Card, mobile and account sales are not counted as drawer cash.</p>
                <Button variant="ghost" size="sm" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
              </div>
              {summary.local && <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" />Includes sales and cash movements saved on this till. Upload pending records before the final Back Office comparison.</p>}

              <div className="grid items-start gap-4 lg:grid-cols-3">
                {rows.map((row) => {
                  const key = row.currency === "USD" ? "usd" : row.currency === "ZiG" ? "zig" : "zar";
                  const exact = row.variance != null && Math.abs(row.variance) < 0.005;
                  return (
                    <section key={row.currency} className="rounded-xl border bg-card p-4 shadow-soft" aria-label={`${row.currency} cash-up`}>
                      <div className="mb-4 flex items-center justify-between border-b pb-3"><h3 className="font-display text-lg font-bold">{row.currency}</h3><span className="text-sm text-muted-foreground">Expected <strong className="ml-1 text-foreground tabular-nums">{money(row.expected, row.currency)}</strong></span></div>

                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ArrowDownToLine className="h-4 w-4 text-success" />Cash in</h4>
                      <div className="space-y-1.5 text-sm">
                        <CashLine label="Opening float" value={money(row.openingFloat, row.currency)} />
                        <CashLine label="Cash sales" value={money(row.cashSales, row.currency)} />
                        <CashLine label="Paid in / deposits" value={money(row.paidIn, row.currency)} />
                        <CashLine label="Total cash in" value={money(row.cashIn, row.currency)} strong />
                      </div>

                      <h4 className="mb-2 mt-5 flex items-center gap-2 text-sm font-semibold"><ArrowUpFromLine className="h-4 w-4 text-warning" />Cash out</h4>
                      <div className="space-y-1.5 text-sm">
                        <CashLine label="Change given" value={money(row.change, row.currency)} />
                        <CashLine label="Cash refunds" value={money(row.refunds, row.currency)} />
                        <CashLine label="Drops & payouts" value={money(row.paidOut, row.currency)} />
                        <CashLine label="Total cash out" value={money(row.cashOut, row.currency)} strong />
                      </div>

                      <div className="mt-4 rounded-lg bg-muted p-3">
                        <CashLine label="Expected in drawer" value={money(row.expected, row.currency)} strong />
                        <label className="mt-3 block text-sm font-semibold" htmlFor={`cash-count-${key}`}>Cash counted</label>
                        <Input id={`cash-count-${key}`} aria-label={`Cash counted in ${row.currency}`} type="number" min={0} step="0.01" inputMode="decimal" value={counts[key]} onChange={(event) => setCount(key, event.target.value)} className="mt-1 h-12 bg-background text-lg tabular-nums" placeholder="0.00" />
                        {row.variance != null && <p className={`mt-2 text-sm font-semibold ${exact ? "text-success" : row.variance < 0 ? "text-destructive" : "text-warning"}`}>{exact ? "Exact match" : `${row.variance < 0 ? "Short" : "Over"} ${money(Math.abs(row.variance), row.currency)}`}</p>}
                      </div>
                      <p className="mt-3 flex justify-between gap-2 text-xs text-muted-foreground" title="Expected drawer cash less opening float; Back Office also adds other shifts and tills."><span>Net cash for Daily settlement</span><strong className="text-foreground tabular-nums">{money(row.settlementCash, row.currency)}</strong></p>
                    </section>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Back Office Daily settlement combines this shift with the day’s other shifts and tills. Your opening float is not sales income.</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t bg-card p-3 sm:px-6">
          <Button variant="outline" onClick={onRecordMovement}>Record cash in / out</Button>
          <Button variant="outline" disabled={!summary} onClick={fillExpected}>Use expected amounts</Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onClose}><ArrowLeft className="h-4 w-4" />Return to till</Button>
            <Button disabled={!parsed || !summary} onClick={() => parsed && onCloseShift(parsed)}><CheckCircle2 className="h-4 w-4" />Close shift with these counts</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CashLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-3 ${strong ? "border-t pt-1.5 font-semibold" : ""}`}><span className={strong ? "" : "text-muted-foreground"}>{label}</span><span className="tabular-nums">{value}</span></div>;
}
