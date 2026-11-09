import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ZimraSettings } from "@/components/ZimraSettings";
import { ReceiptDesigner } from "@/components/ReceiptDesigner";
import { Upload, Trash2 } from "lucide-react";
import { ReceiptLogo } from "@/components/ReceiptLogo";
import { prepareReceiptLogo, receiptLogoSource } from "@/lib/receipt-logo";

export const Route = createFileRoute("/_authenticated/store")({
  head: () => ({
    meta: [
      { title: "Store profile — Tilla POS" },
      { name: "description", content: "Set your shop name, contact details, tax number, logo and receipt footer." },
      { property: "og:title", content: "Store profile — Tilla POS" },
      { property: "og:description", content: "Set your shop name, contact details, tax number, logo and receipt footer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
] as const;

type Form = Record<(typeof FIELDS)[number][0] | "logo_url" | "receipt_footer" | "vat_rate", string> & { vat_enabled: boolean };

function StorePage() {
  const { data: st } = useSettings();
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (st && !f) setF({
      business_name: st.business_name ?? "", address: st.address ?? "", phone: st.phone ?? "", email: st.email ?? "",
      tax_number: st.tax_number ?? "", logo_url: st.logo_url ?? "", receipt_footer: st.receipt_footer ?? "",
      vat_rate: String(st.vat_rate ?? 15), vat_enabled: !!st.vat_enabled,
    });
  }, [st, f]);

  const canEdit = !!me?.canManageStock;

  async function uploadLogo(file: File) {
    if (!f || !me?.storeId || !canEdit) return;
    setUploading(true);
    try {
      const image = await prepareReceiptLogo(file);
      const path = `${me.storeId}/receipt-logos/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage.from("product-images").upload(path, image, { contentType: "image/png" });
      if (error) throw error;
      await receiptLogoSource(path);
      setF((current) => current ? { ...current, logo_url: path } : current);
      toast.success("Logo uploaded. Save to apply it to receipts.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not upload logo"); }
    finally { setUploading(false); if (logoInput.current) logoInput.current.value = ""; }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f || !canEdit || uploading || busy) return;
    if (!f.business_name.trim()) { toast.error("Trading name is required"); return; }
    const rate = Number(f.vat_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { toast.error("VAT rate must be between 0 and 100%"); return; }
    setBusy(true);
    const { error } = await supabase.from("settings").update({ ...f, vat_rate: rate, prices_include_vat: true, updated_at: new Date().toISOString() }).eq("store_id", me?.storeId ?? "");
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
        <div className="space-y-2">
          <Label>Receipt logo</Label>
          {f.logo_url && <div className="flex h-24 items-center justify-center border bg-background p-2"><ReceiptLogo src={f.logo_url} className="max-h-full max-w-full object-contain" /></div>}
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose receipt logo" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadLogo(file); }} />
          {canEdit && <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={uploading || busy} onClick={() => logoInput.current?.click()}><Upload className="h-4 w-4" />{uploading ? "Uploading…" : f.logo_url ? "Replace logo" : "Upload logo"}</Button>
            {f.logo_url && <Button type="button" variant="ghost" disabled={uploading || busy} onClick={() => setF({ ...f, logo_url: "" })}><Trash2 className="h-4 w-4" />Remove logo</Button>}
          </div>}
        </div>
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
        <div className="space-y-3 rounded-xl border p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" disabled={!canEdit} checked={f.vat_enabled} onChange={(e) => setF({ ...f, vat_enabled: e.target.checked })} />
            Show VAT on receipts
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="vat_rate">VAT rate (%)</Label>
            <Input id="vat_rate" type="number" step="0.01" min="0" max="100" disabled={!canEdit || !f.vat_enabled} value={f.vat_rate} onChange={(e) => setF({ ...f, vat_rate: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">Your shelf prices already include VAT. Receipts show the amount before VAT and the VAT portion; what customers pay does not change.</p>
        </div>
        <Link to="/currencies" className="text-sm font-medium text-primary underline">Currency settings →</Link>
        {canEdit ? <Button type="submit" disabled={busy || uploading}>{busy ? "Saving…" : "Save receipt details"}</Button> : <p className="text-sm text-muted-foreground">Only managers and owners can change these.</p>}
      </form>
      <div className="mt-6 rounded-2xl bg-card p-6 shadow-soft"><ReceiptDesigner store={{ ...st, ...f, vat_rate: Number(f.vat_rate) }} /></div>
      <div className="mt-6 rounded-2xl bg-card p-6 shadow-soft"><ZimraSettings canEdit={!!me?.isOwner} /></div>
    </div>
  );
}
