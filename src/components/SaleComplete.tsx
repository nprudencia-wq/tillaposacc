import { useEffect, useRef, useState } from "react";
import { Printer, ArrowRight, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Receipt, type ReceiptData } from "@/components/Receipt";
import { money, fromUSD } from "@/lib/pos";
import { deviceStorageKey } from "@/lib/offline";
import { isCashMethod } from "@/lib/payment-types";
import { useSettings } from "@/hooks/use-staff";
import { receiptConfig } from "@/lib/receipt-config";
import { receiptBytes, type StoreInfo } from "@/lib/escpos";
import { loadHardware, openDrawer, saveHardware, sendToPrinter } from "@/lib/hardware";
import { toast } from "sonner";

export function SaleComplete({ receipt, onNext }: { receipt: ReceiptData; onNext: () => void }) {
  const print = useRef<HTMLButtonElement>(null);
  const [automatic, setAutomatic] = useState(false);
  const { data: settings } = useSettings();

  async function doPrint() {
    const hw = loadHardware();
    if (hw.printer === "none") { window.print(); return; }
    const st = settings as (StoreInfo & { receipt_config?: unknown }) | undefined;
    try { await sendToPrinter(receiptBytes(receipt, st, receiptConfig(st?.receipt_config)), hw); }
    catch (e) { toast.error(`Printer: ${e instanceof Error ? e.message : "failed"}`); }
  }

  useEffect(() => {
    const hw = loadHardware();
    let saved = hw.autoPrint;
    try { if (localStorage.getItem(deviceStorageKey("tilla-auto-print")) === "true") saved = true; } catch { /* identity not ready */ }
    setAutomatic(saved);
    print.current?.focus();
    const cash = receipt.payments.some((p) => isCashMethod(p.method) && p.amount > 0);
    if (hw.autoDrawer && cash && hw.drawer !== "none") openDrawer(hw).catch((e) => toast.error(`Drawer: ${e instanceof Error ? e.message : "failed"}`));
    if (saved) {
      const id = window.setTimeout(() => void doPrint(), 350);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.sale_number]);

  function toggleAuto(on: boolean) {
    setAutomatic(on);
    saveHardware({ ...loadHardware(), autoPrint: on });
    try { localStorage.setItem(deviceStorageKey("tilla-auto-print"), String(on)); } catch { /* ignore */ }
  }
  async function share() {
    const text = `${receipt.business}\n${receipt.sale_number}\nTotal: ${money(fromUSD(receipt.total, receipt.currency, receipt.rate, receipt.rate), receipt.currency)}`;
    try {
      if (navigator.share) await navigator.share({ title: receipt.sale_number, text });
      else { await navigator.clipboard.writeText(text); toast.success("Receipt copied"); }
    } catch { /* sharing cancelled */ }
  }
  return <div className="space-y-4">
    <div className="border-b pb-4">
      <p className="text-sm text-muted-foreground">Change due</p>
      <p className="font-display text-3xl font-bold text-success">{money(fromUSD(receipt.change, receipt.currency, receipt.rate, receipt.rate), receipt.currency)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{receipt.sale_number} · Total {money(fromUSD(receipt.total, receipt.currency, receipt.rate, receipt.rate), receipt.currency)}</p>
    </div>
    <Button ref={print} size="lg" className="h-12 w-full" onClick={() => void doPrint()}><Printer className="h-5 w-5" />Print Receipt</Button>
    <Button size="lg" variant="outline" className="h-12 w-full" onClick={onNext}><X className="h-5 w-5" />No Receipt — Next Sale</Button>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={(e) => toggleAuto(e.target.checked)} />Always print automatically</label>
    <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={share}><Share2 className="h-4 w-4" />Share</Button><Button className="flex-1" variant="secondary" onClick={onNext}><ArrowRight className="h-4 w-4" />New Sale</Button></div>
    <div className="max-h-[35vh] overflow-auto border-t pt-3"><Receipt r={receipt} /></div>
  </div>;
}
