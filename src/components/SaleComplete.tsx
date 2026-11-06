import { useEffect, useRef, useState } from "react";
import { Printer, ArrowRight, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Receipt, type ReceiptData } from "@/components/Receipt";
import { money, fromUSD } from "@/lib/pos";
import { deviceStorageKey } from "@/lib/offline";
import { toast } from "sonner";

export function SaleComplete({ receipt, onNext }: { receipt: ReceiptData; onNext: () => void }) {
  const print = useRef<HTMLButtonElement>(null);
  const [automatic, setAutomatic] = useState(false);
  useEffect(() => {
    let saved = false;
    try { saved = localStorage.getItem(deviceStorageKey("tilla-auto-print")) === "true"; } catch { /* identity not ready */ }
    setAutomatic(saved);
    print.current?.focus();
    if (saved) {
      const id = window.setTimeout(() => window.print(), 350);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [receipt.sale_number]);
  async function share() {
    const text = `${receipt.business}\n${receipt.sale_number}\nTotal: ${money(fromUSD(receipt.total, receipt.currency, receipt.rate), receipt.currency)}`;
    try {
      if (navigator.share) await navigator.share({ title: receipt.sale_number, text });
      else { await navigator.clipboard.writeText(text); toast.success("Receipt copied"); }
    } catch { /* sharing cancelled */ }
  }
  return <div className="space-y-4">
    <div className="border-b pb-4">
      <p className="text-sm text-muted-foreground">Change due</p>
      <p className="font-display text-3xl font-bold text-success">{money(fromUSD(receipt.change, receipt.currency, receipt.rate), receipt.currency)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{receipt.sale_number} · Total {money(fromUSD(receipt.total, receipt.currency, receipt.rate), receipt.currency)}</p>
    </div>
    <Button ref={print} size="lg" className="h-12 w-full" onClick={() => window.print()}><Printer className="h-5 w-5" />Print Receipt</Button>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={(e) => { setAutomatic(e.target.checked); localStorage.setItem(deviceStorageKey("tilla-auto-print"), String(e.target.checked)); }} />Always print automatically</label>
    <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={share}><Share2 className="h-4 w-4" />Share</Button><Button className="flex-1" variant="secondary" onClick={onNext}><ArrowRight className="h-4 w-4" />New Sale</Button></div>
    <div className="max-h-[35vh] overflow-auto border-t pt-3"><Receipt r={receipt} /></div>
  </div>;
}