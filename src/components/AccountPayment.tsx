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
export function AccountPaymentDialog({ customer, customers, shiftId, zigRate, randRate, randEnabled, onClose }: {
  customer: Customer | null; customers?: Customer[]; shiftId: string | null; zigRate: number; randRate: number; randEnabled: boolean; onClose: () => void;
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
  // When the till has no customer on the sale, the cashier picks one here.
  const [pickedId, setPickedId] = useState(customer?.id ?? "");
  const who = customer ?? (customers ?? []).find((c) => c.id === pickedId) ?? null;
  useEffect(() => {
    if (!who) { setOwed(null); return; }
    void customerOwed(who.id).then(setOwed).catch(() => setOwed(null));
  }, [who?.id]);
  const m = method || methods[0]?.code || "";

  async function save() {
    if (!who) { toast.error("Pick a customer first"); return; }
    const value = Number(amount);
    if (!(value > 0) || !Number.isFinite(value)) { toast.error("Enter an amount above zero"); return; }
    if (!m) { toast.error("Add a payment type first"); return; }
    const rate = currencyRate(currency, zigRate, randRate);
    if (!(rate > 0)) { toast.error("Set the exchange rate first"); return; }
    const isCash = methods.find((t) => t.code === m)?.is_cash;
    if (isCash && !shiftId) { toast.error("Open a shift to take cash from a customer"); return; }
    setBusy(true);
    try {
      await enqueueRepayment({ client_ref: ref, customer_id: who.id, customer_name: who.name, amount: value, currency, usd: Math.round((value / rate) * 100) / 100, method: m, reference, paid_at: new Date().toISOString(), shift_id: shiftId });
      toast.success(`Payment of ${money(value, currency)} recorded for ${who.name}`);
      void syncQueue();
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Account payment{who ? ` — ${who.name}` : ""}</DialogTitle></DialogHeader>
        {!customer && (
          <Select value={pickedId} onValueChange={setPickedId}>
            <SelectTrigger aria-label="Customer paying on account"><SelectValue placeholder="Pick the customer paying…" /></SelectTrigger>
            <SelectContent>{(customers ?? []).filter((c) => c.active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <p className="text-sm text-muted-foreground">{who ? <>Owes {owed === null ? "…" : money(owed)}{who.credit_limit > 0 ? ` · limit ${money(who.credit_limit)}` : ""}. </> : ""}Works offline; it uploads when the internet is back.</p>
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
