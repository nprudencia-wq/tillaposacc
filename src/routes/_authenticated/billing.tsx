import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { useSubscription } from "@/components/SubscriptionBanner";
import { vendorDecide, vendorUpdatePlan } from "@/lib/billing.functions";
import { money } from "@/lib/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & subscription — Tilla POS" },
      { name: "description", content: "See your monthly subscription, pay by EcoCash, InnBucks or bank, and view your invoices." },
      { property: "og:title", content: "Billing & subscription — Tilla POS" },
      { property: "og:description", content: "See your monthly subscription, pay by EcoCash, InnBucks or bank, and view your invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

type Pay = { id: string; invoice_number: string; months: number; amount: number; method: string; reference: string; payer_phone: string | null; status: string; period_from: string | null; period_to: string | null; submitted_at: string; decision_note: string | null };
const METHODS = ["EcoCash", "InnBucks", "OneMoney", "Bank transfer", "Cash"];

function BillingPage() {
  const { data: st } = useSettings();
  const { data: me } = useStaff();
  const sub = useSubscription();
  const qc = useQueryClient();
  const s = st as unknown as { plan_name: string; plan_price_usd: number; grace_days: number; paid_until: string; vendor_name: string; vendor_pay_details: string; business_name: string; till_count: number; billing_exempt: boolean } | undefined;
  const { data: pays = [] } = useQuery({
    queryKey: ["sub-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_payments").select("*").order("submitted_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Pay[];
    },
  });
  const canPay = !s?.billing_exempt && !!me && me.roles.some((r) => ["admin", "owner", "manager"].includes(r));
  const [f, setF] = useState({ months: "1", method: "EcoCash", reference: "", phone: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("submit_subscription_payment", { p_months: Number(f.months), p_method: f.method, p_reference: f.reference, p_phone: f.phone });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment sent for confirmation");
    setF({ ...f, reference: "", phone: "" });
    qc.invalidateQueries({ queryKey: ["sub-payments"] });
  }

  function printInvoice(p: Pay) {
    const w = window.open("", "_blank", "width=420,height=600");
    if (!w || !s) return;
    w.document.write(`<pre style="font-family:monospace;font-size:13px">INVOICE ${p.invoice_number}
${s.vendor_name || "Software provider"}
Billed to: ${s.business_name}
Date: ${new Date(p.submitted_at).toLocaleDateString()}

POS subscription: ${(p as Pay & { tills?: number }).tills ?? 1} till(s) x ${p.months} month(s)
Amount: ${money(Number(p.amount))}
Paid by: ${p.method}  Ref: ${p.reference}
Period: ${p.period_from ?? "-"} to ${p.period_to ?? "-"}
Status: ${p.status.toUpperCase()}</pre>`);
    w.document.close(); w.print();
  }

  if (!s || !sub) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const label = { active: "Active", grace: "Overdue (grace period)", locked: "Locked" }[sub.state];
  const tills = Number(s.till_count) || 1;
  const total = Number(s.plan_price_usd) * tills * Number(f.months || 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Billing & subscription</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your monthly fee for using Tilla POS.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Box label="Status" value={s.billing_exempt ? "Free (no subscription)" : label} tone={s.billing_exempt ? undefined : sub.state} />
        <Box label="Paid until" value={s.billing_exempt ? "—" : new Date(sub.paidUntil + "T00:00:00").toLocaleDateString()} />
        <Box label={`${tills} till${tills > 1 ? "s" : ""} × ${money(Number(s.plan_price_usd))}`} value={`${money(Number(s.plan_price_usd) * tills)} / month`} />
      </div>

      {canPay && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-card p-6 shadow-soft">
          <h2 className="font-display text-lg font-semibold">Pay subscription</h2>
          <div className="rounded-xl bg-muted p-4 text-sm whitespace-pre-wrap">
            <p className="font-semibold">How to pay {s.vendor_name}</p>
            {s.vendor_pay_details || "Your provider hasn't added payment details yet. Contact them for the EcoCash or bank number."}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="m">Months</Label>
              <select id="m" className="h-10 w-full rounded-md border bg-background px-3" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })}>
                {[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n} month{n > 1 ? "s" : ""}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label htmlFor="pm">Paid by</Label>
              <select id="pm" className="h-10 w-full rounded-md border bg-background px-3" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label htmlFor="ref">Transaction reference</Label>
              <Input id="ref" required value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="e.g. PP241104.1530.A12345" /></div>
            <div className="space-y-1.5"><Label htmlFor="ph">Paid from phone / account (optional)</Label>
              <Input id="ph" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Total: {money(total)}</span>
            <Button type="submit" disabled={busy}>Send payment</Button>
          </div>
          <p className="text-xs text-muted-foreground">Your subscription is extended once your provider confirms the payment.</p>
        </form>
      )}

      <div className="rounded-2xl bg-card p-6 shadow-soft">
        <h2 className="font-display text-lg font-semibold">Payments & invoices</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Invoice</th><th>Date</th><th>Months</th><th>Amount</th><th>Method / ref</th><th>Status</th><th /></tr></thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 font-mono">{p.invoice_number}</td>
                  <td>{new Date(p.submitted_at).toLocaleDateString()}</td>
                  <td>{p.months}</td>
                  <td>{money(Number(p.amount))}</td>
                  <td>{p.method} · {p.reference}</td>
                  <td className="capitalize">{p.status}{p.period_to ? ` (to ${p.period_to})` : ""}</td>
                  <td><Button size="sm" variant="outline" onClick={() => printInvoice(p)}>Print</Button></td>
                </tr>
              ))}
              {!pays.length && <tr><td colSpan={7} className="py-4 text-muted-foreground">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <VendorPanel s={s} pays={pays} />
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold ${tone === "locked" ? "text-destructive" : tone === "grace" ? "text-accent-foreground" : ""}`}>{value}</div>
    </div>
  );
}

function VendorPanel({ s, pays }: { s: { plan_price_usd: number; till_count: number; billing_exempt: boolean; grace_days: number; paid_until: string; vendor_name: string; vendor_pay_details: string }; pays: Pay[] }) {
  const qc = useQueryClient();
  const decide = useServerFn(vendorDecide);
  const update = useServerFn(vendorUpdatePlan);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [p, setP] = useState({ price: String(s.plan_price_usd), tills: String(s.till_count ?? 1), exempt: !!s.billing_exempt, grace: String(s.grace_days), paidUntil: s.paid_until, vendor: s.vendor_name, details: s.vendor_pay_details });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sub-payments"] }); qc.invalidateQueries({ queryKey: ["settings"] }); };

  async function act(id: string, approve: boolean) {
    try { await decide({ data: { code, paymentId: id, approve } }); toast.success(approve ? "Approved — subscription extended" : "Rejected"); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function save() {
    try { await update({ data: { code, price: Number(p.price), tills: Number(p.tills), exempt: p.exempt, grace: Number(p.grace), paidUntil: p.paidUntil, vendor: p.vendor, details: p.details } }); toast.success("Plan saved"); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  if (!open) return <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline">Software provider access</button>;
  const pending = pays.filter((x) => x.status === "pending");
  return (
    <div className="space-y-4 rounded-2xl border border-dashed p-6">
      <h2 className="font-display text-lg font-semibold">Software provider</h2>
      <div className="space-y-1.5"><Label htmlFor="vc">Vendor code</Label><Input id="vc" type="password" value={code} onChange={(e) => setCode(e.target.value)} /></div>
      <div>
        <h3 className="font-semibold">Payments to confirm</h3>
        {pending.map((x) => (
          <div key={x.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
            <span>{x.invoice_number} · {money(Number(x.amount))} · {x.months} mo · {x.method} {x.reference}{x.payer_phone ? ` · ${x.payer_phone}` : ""}</span>
            <span className="flex gap-2"><Button size="sm" onClick={() => act(x.id, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => act(x.id, false)}>Reject</Button></span>
          </div>
        ))}
        {!pending.length && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="pr">Price per till per month (USD)</Label><Input id="pr" type="number" step="0.01" value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="gd">Grace days</Label><Input id="gd" type="number" value={p.grace} onChange={(e) => setP({ ...p, grace: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pu">Paid until</Label><Input id="pu" type="date" value={p.paidUntil} onChange={(e) => setP({ ...p, paidUntil: e.target.value })} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="tc">Number of tills (POS)</Label><Input id="tc" type="number" min={1} value={p.tills} onChange={(e) => setP({ ...p, tills: e.target.value })} /></div>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={p.exempt} onChange={(e) => setP({ ...p, exempt: e.target.checked })} />Free — this shop doesn't pay</label>
      </div>
      <div className="space-y-1.5"><Label htmlFor="vn">Your business name</Label><Input id="vn" value={p.vendor} onChange={(e) => setP({ ...p, vendor: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="vd">How clients pay you (EcoCash number, InnBucks code, bank details)</Label><Textarea id="vd" rows={4} value={p.details} onChange={(e) => setP({ ...p, details: e.target.value })} /></div>
      <Button onClick={save}>Save plan</Button>
    </div>
  );
}
