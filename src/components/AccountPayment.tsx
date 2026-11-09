import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activeTypes, usePaymentTypes } from "@/lib/payment-types";
import { currencyRate, money, type Currency } from "@/lib/pos";
import { customerOwed, enqueueRepayment } from "@/lib/offline-credit";
import { syncQueue } from "@/lib/offline";
import type { Customer } from "@/components/Customers";

/** Take a customer's debt payment at the till. Saved on the device first, so it works with no internet. */
export function AccountPaymentDialog({ customer, shiftId, zigRate, randRate, randEnabled, onClose }: {
  customer: Customer; shiftId: string | null; zigRate: number; randRate: number; randEnabled: boolean; onClose: () => void;
}) {
  const { data: types } = usePaymentTypes();
  const methods = activeTypes(types).filter((t) => !t.is_account);
  const [method, setMethod] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [owed, setOwed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [ref] = useState(() => `PAY-${crypto.randomUUID()}`);
  useEffect(() => { void customerOwed(customer.id).then(setOwed).catch(() => setOwed(null)); }, [customer.id]);
  const m = method || methods[0]?.code || "";

  async function save() {
    const value = Number(amount);
    if (!(value > 0) || !Number.isFinite(value)) { toast.error("Enter an amount above zero"); return; }
    if (!m) { toast.error("Add a payment type first"); return; }
    const rate = currencyRate(currency, zigRate, randRate);
    if (!(rate > 0)) { toast.error("Set the exchange rate first"); return; }
    const isCash = methods.find((t) => t.code === m)?.is_cash;
    if (isCash && !shiftId) { toast.error("Open a shift to take cash from a customer"); return; }
    setBusy(true);
    try {
      await enqueueRepayment({ client_ref: ref, customer_id: customer.id, customer_name: customer.name, amount: value, currency, usd: Math.round((value / rate) * 100) / 100, method: m, reference, paid_at: new Date().toISOString(), shift_id: shiftId });
      toast.success(`Payment of ${money(value, currency)} recorded for ${customer.name}`);
      void syncQueue();
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Account payment — {customer.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Owes {owed === null ? "…" : money(owed)}{customer.credit_limit > 0 ? ` · limit ${money(customer.credit_limit)}` : ""}. Works offline; it uploads when the internet is back.</p>
        <div className="grid grid-cols-2 gap-2">
          <Select value={m} onValueChange={setMethod}>
            <SelectTrigger aria-label="Payment type"><SelectValue placeholder="Payment type" /></SelectTrigger>
            <SelectContent>{methods.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZiG">ZiG</SelectItem>{randEnabled && <SelectItem value="ZAR">Rand</SelectItem>}</SelectContent>
          </Select>
        </div>
        <Input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg" autoFocus />
        <Input placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Button size="lg" disabled={busy} onClick={save}>Record payment</Button>
      </DialogContent>
    </Dialog>
  );
}
