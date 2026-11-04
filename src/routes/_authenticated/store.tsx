import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/store")({
  head: () => ({
    meta: [
      { title: "Store profile — Tilla POS" },
      { name: "description", content: "Set your shop name, contact details, tax number, logo and receipt footer." },
      { property: "og:title", content: "Store profile — Tilla POS" },
      { property: "og:description", content: "Set your shop name, contact details, tax number, logo and receipt footer." },
    ],
  }),
  component: StorePage,
});

const FIELDS = [
  ["business_name", "Trading name"],
  ["address", "Address"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["tax_number", "VAT / TIN number"],
  ["logo_url", "Logo web link (optional)"],
] as const;

type Form = Record<(typeof FIELDS)[number][0] | "receipt_footer", string>;

function StorePage() {
  const { data: st } = useSettings();
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (st && !f) setF({
      business_name: st.business_name ?? "", address: st.address ?? "", phone: st.phone ?? "", email: st.email ?? "",
      tax_number: st.tax_number ?? "", logo_url: st.logo_url ?? "", receipt_footer: st.receipt_footer ?? "",
    });
  }, [st, f]);

  const canEdit = !!me?.canManageStock;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    if (!f.business_name.trim()) { toast.error("Trading name is required"); return; }
    setBusy(true);
    const { error } = await supabase.from("settings").update({ ...f, updated_at: new Date().toISOString() }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Store profile saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  if (!f) return <div className="p-6 text-muted-foreground">Loading…</div>;
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <h1 className="font-display text-2xl font-bold">Store profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">These details print on every receipt. Set them up when you start with a new shop.</p>
      <form onSubmit={save} className="mt-6 space-y-4 rounded-2xl bg-card p-6 shadow-soft">
        {FIELDS.map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={k}>{label}</Label>
            <Input id={k} disabled={!canEdit} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="footer">Receipt footer</Label>
          <Textarea id="footer" disabled={!canEdit} rows={3} value={f.receipt_footer} onChange={(e) => setF({ ...f, receipt_footer: e.target.value })} />
        </div>
        {canEdit ? <Button type="submit" disabled={busy}>Save</Button> : <p className="text-sm text-muted-foreground">Only managers and owners can change these.</p>}
      </form>
    </div>
  );
}
