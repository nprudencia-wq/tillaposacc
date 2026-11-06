import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { randCheckoutEnabled, reciprocalRate } from "@/lib/currency-settings";

export const Route = createFileRoute("/_authenticated/currencies")({
  head: () => ({ meta: [
    { title: "Currency settings — Tilla POS" },
    { name: "description", content: "Review USD, ZiG and Rand exchange rates and confirm Rand checkout for your store." },
    { property: "og:title", content: "Currency settings — Tilla POS" },
    { property: "og:description", content: "Review both exchange-rate directions before enabling Rand checkout." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CurrencySettingsPage,
});

const format = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

function CurrencySettingsPage() {
  const { data: settings, error } = useSettings();
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const [zig, setZig] = useState("");
  const [rand, setRand] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!settings) return;
    setZig(String(settings.zig_rate)); setRand(String(settings.rand_rate));
    setConfirmed(randCheckoutEnabled(settings.rand_rate, settings.rand_confirmed_rate));
  }, [settings]);
  const rate = Number(rand);
  const inverse = reciprocalRate(rate);
  const zigInverse = reciprocalRate(Number(zig));
  const enabled = settings && randCheckoutEnabled(settings.rand_rate, settings.rand_confirmed_rate);
  const canEdit = !!me?.canManagePaymentTypes;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!inverse || !zigInverse) { toast.error("Enter positive exchange rates"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_currency_settings", { p_zig_rate: Number(zig), p_rand_rate: rate, p_confirm_rand: confirmed });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(confirmed ? "Currency rates saved. Rand checkout enabled." : "Currency rates saved. Rand checkout disabled.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save currency settings"); }
    finally { setBusy(false); }
  }
  if (error) return <p className="p-6 text-destructive">Currency settings could not be loaded.</p>;
  if (!settings) return <p className="p-6 text-muted-foreground">Loading currencies…</p>;
  return <div className="mx-auto max-w-3xl p-4 md:p-8">
    <h1 className="font-display text-2xl font-bold">Currency settings</h1>
    <div className="mt-5 flex items-center gap-2 border-b pb-5 text-sm">
      {enabled ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <CircleAlert className="h-5 w-5 shrink-0 text-warning" />}
      <span className="font-semibold">Rand checkout {enabled ? "enabled" : "disabled · confirmation required"}</span>
    </div>
    <form onSubmit={save} className="space-y-6">
      <section className="border-b py-5">
        <h2 className="font-semibold">USD · US Dollar</h2>
        <p className="mt-2 text-sm text-muted-foreground">Base currency · US$1 = US$1</p>
      </section>
      <section className="border-b pb-6">
        <h2 className="font-semibold">ZiG · Zimbabwe Gold</h2>
        <div className="mt-3 max-w-sm space-y-2"><Label htmlFor="zig-rate">ZiG for US$1</Label><Input id="zig-rate" type="number" min="0.000001" step="any" value={zig} disabled={!canEdit || busy} onChange={(e) => setZig(e.target.value)} /></div>
        {zigInverse && <p className="mt-3 text-sm text-muted-foreground">US$1 = ZiG {format(Number(zig))} · ZiG 1 = US${format(zigInverse)}</p>}
      </section>
      <section className="space-y-4 border-b pb-6">
        <h2 className="font-semibold">ZAR · South African Rand</h2>
        <div className="max-w-sm space-y-2"><Label htmlFor="rand-rate">Rand for US$1</Label><Input id="rand-rate" type="number" min="0.000001" step="any" value={rand} disabled={!canEdit || busy} onChange={(e) => { setRand(e.target.value); setConfirmed(false); }} /></div>
        {inverse ? <div className="grid gap-3 bg-muted p-4 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Dollar → Rand</p><p className="mt-1 font-display text-xl font-semibold">US$1 = R{format(rate)}</p></div>
          <div><p className="text-xs text-muted-foreground">Rand → Dollar</p><p className="mt-1 font-display text-xl font-semibold">R1 = US${format(inverse)}</p></div>
        </div> : <p className="text-sm text-destructive">Enter a positive Rand rate.</p>}
        <div className="flex items-start gap-3">
          <Checkbox id="confirm-rand" className="mt-0.5 shrink-0" checked={confirmed} disabled={!canEdit || !inverse || busy} onCheckedChange={(v) => setConfirmed(v === true)} />
          <Label htmlFor="confirm-rand" className="text-sm leading-6">I confirm both displayed conversions match my intended rate and want to enable Rand checkout.</Label>
        </div>
        <p className="text-sm text-muted-foreground">Changing the Rand rate requires a new confirmation. Past sales retain their original rates.</p>
      </section>
      {canEdit ? <Button type="submit" disabled={busy || !inverse || !zigInverse}><Save className="h-4 w-4" />{busy ? "Saving…" : confirmed ? "Save & enable Rand checkout" : "Save · keep Rand disabled"}</Button> : <p className="text-sm text-muted-foreground">Only owners and managers can change currency settings.</p>}
    </form>
  </div>;
}