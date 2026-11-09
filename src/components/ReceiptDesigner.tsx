import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Trash2 } from "lucide-react";
import { Receipt, type ReceiptData, type StoreLike } from "@/components/Receipt";
import { receiptConfig, type ReceiptConfig } from "@/lib/receipt-config";

const TOGGLES: [keyof ReceiptConfig, string][] = [
  ["show_logo", "Logo"], ["show_address", "Address"], ["show_phone", "Phone"], ["show_email", "Email"],
  ["show_tax_number", "VAT / TIN number"], ["show_cashier", "Cashier name"], ["show_customer", "Customer name"],
  ["show_other_currencies", "Totals in other currencies"], ["show_barcode", "Receipt QR code (scan to find sale)"],
];

const SAMPLE: ReceiptData = {
  sale_number: "REC-00104", created_at: new Date().toISOString(), business: "", cashier: "Sarah M.", customer: "John Moyo",
  currency: "USD", rate: 1, subtotal: 7.8, discount: 0.39, total: 7.41, change: 0,
  items: [
    { name: "Bread", quantity: 2, unit_price: 1, line_total: 2 },
    { name: "Milk 1L", quantity: 1, unit_price: 1.6, line_total: 1.6 },
    { name: "Cooking Oil 2L", quantity: 1, unit_price: 4.2, line_total: 4.2 },
  ],
  payments: [{ method: "cash", currency: "USD", amount: 7.41 }],
};

type LogoControls = { hasLogo: boolean; uploading: boolean; onUpload: () => void; onRemove: () => void };

export function ReceiptDesigner({ store, logo }: { store?: StoreLike; logo?: LogoControls }) {
  const { data: st } = useSettings();
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const [c, setC] = useState<ReceiptConfig | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (st && !c) setC(receiptConfig(st.receipt_config)); }, [st, c]);
  const canEdit = !!me?.canManageStock;
  if (!c || !st) return null;

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("settings").update({ receipt_config: c as unknown as Json, updated_at: new Date().toISOString() }).eq("store_id", me?.storeId ?? "");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Receipt layout saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  const set = (p: Partial<ReceiptConfig>) => setC({ ...c, ...p });

  return (
    <div>
      <h2 className="font-display text-lg font-bold">Receipt layout</h2>
      <p className="text-sm text-muted-foreground">Choose what prints on your receipts. The preview updates as you change things.</p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Paper roll</Label>
            <div className="flex gap-2">
              {(["58mm", "80mm"] as const).map((w) => <Button key={w} type="button" size="sm" disabled={!canEdit} variant={c.paper_width === w ? "default" : "outline"} onClick={() => set({ paper_width: w })}>{w}</Button>)}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Item lines</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={!canEdit} variant={c.item_layout === "standard" ? "default" : "outline"} onClick={() => set({ item_layout: "standard" })}>Two lines</Button>
              <Button type="button" size="sm" disabled={!canEdit} variant={c.item_layout === "compact" ? "default" : "outline"} onClick={() => set({ item_layout: "compact" })}>One line</Button>
            </div>
          </div>
          {logo && canEdit && (
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={logo.uploading} onClick={logo.onUpload}><Upload className="h-4 w-4" />{logo.uploading ? "Uploading…" : logo.hasLogo ? "Replace logo" : "Upload logo"}</Button>
                {logo.hasLogo && <Button type="button" size="sm" variant="ghost" disabled={logo.uploading} onClick={logo.onRemove}><Trash2 className="h-4 w-4" />Remove</Button>}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG or WebP. Shows on screen and printed receipts.</p>
            </div>
          )}
          <div className="space-y-2">
            {TOGGLES.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!canEdit} checked={!!c[k]} onChange={(e) => set({ [k]: e.target.checked })} />{label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policy">Return policy</Label>
            <Textarea id="policy" rows={2} disabled={!canEdit} placeholder="e.g. Exchanges within 7 days with this receipt" value={c.return_policy} onChange={(e) => set({ return_policy: e.target.value })} />
          </div>
          {canEdit && <Button type="button" disabled={busy} onClick={save}>Save receipt layout</Button>}
        </div>
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="mb-2 text-xs text-muted-foreground">Preview ({c.paper_width})</div>
          <Receipt r={{ ...SAMPLE, business: store?.business_name ?? st.business_name ?? "" }} store={store ?? st} config={c} />
        </div>
      </div>
    </div>
  );
}
