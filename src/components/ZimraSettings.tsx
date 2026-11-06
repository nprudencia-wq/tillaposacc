import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [
  ["taxpayer_name", "Taxpayer name (as registered)"],
  ["taxpayer_tin", "Taxpayer TIN"],
  ["vat_number", "VAT number"],
  ["bp_number", "BP number"],
  ["device_id", "Fiscal device ID"],
  ["device_serial", "Device serial number"],
  ["device_model", "Device model name"],
  ["device_version", "Device model version"],
] as const;
type K = (typeof FIELDS)[number][0];

export function ZimraSettings({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["zimra"],
    queryFn: async () => {
      const [{ data: cfg }, { data: day }, { data: counts }] = await Promise.all([
        supabase.from("zimra_config").select("*").maybeSingle(),
        supabase.from("zimra_fiscal_days").select("*").eq("status", "open").maybeSingle(),
        supabase.from("zimra_receipts").select("status"),
      ]);
      const tally: Record<string, number> = {};
      (counts ?? []).forEach((r) => { tally[r.status] = (tally[r.status] ?? 0) + 1; });
      return { cfg, day, tally };
    },
  });
  const [f, setF] = useState<Record<K, string> & { enabled: boolean; environment: string; activation_key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    const c = data.cfg;
    setF({ ...Object.fromEntries(FIELDS.map(([k]) => [k, c?.[k] ?? ""])) as Record<K, string>, enabled: !!c?.enabled, environment: c?.environment ?? "test", activation_key: "" });
  }, [data]);

  async function save() {
    if (!f) return;
    setBusy(true);
    const { error } = await supabase.rpc("save_zimra_config", { p: f });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("ZIMRA settings saved");
    qc.invalidateQueries({ queryKey: ["zimra"] });
  }
  async function closeDay() {
    const { error } = await supabase.rpc("zimra_close_fiscal_day");
    if (error) { toast.error(error.message); return; }
    toast.success("Fiscal day closed");
    qc.invalidateQueries({ queryKey: ["zimra"] });
  }

  if (!f) return null;
  const c = data?.cfg;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="font-semibold">ZIMRA fiscalisation (FDMS)</div>
      <p className="text-xs text-muted-foreground">Fill these in when ZIMRA registers your device. While switched on, every sale and refund gets a fiscal day, receipt number and security code, and waits in the queue until your device keys and certificate are installed.</p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" disabled={!canEdit} checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        Record fiscal receipts
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="z_env">Environment</Label>
        <select id="z_env" disabled={!canEdit} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}>
          <option value="test">Test (ZIMRA test server)</option>
          <option value="production">Production</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`z_${k}`}>{label}</Label>
            <Input id={`z_${k}`} disabled={!canEdit} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="z_key">Activation key {c?.activation_key_set && <span className="text-success">(saved)</span>}</Label>
        <Input id="z_key" type="password" autoComplete="off" disabled={!canEdit} placeholder={c?.activation_key_set ? "Leave blank to keep the saved key" : "From ZIMRA"} value={f.activation_key} onChange={(e) => setF({ ...f, activation_key: e.target.value })} />
        <p className="text-xs text-muted-foreground">Stored privately; nobody can read it back from the app.</p>
      </div>
      <div className="rounded-lg bg-muted p-3 text-xs">
        <div>Device certificate: {c?.certificate_set ? "installed" : "not installed yet"}</div>
        <div>Fiscal day: {data?.day ? `Day ${data.day.day_no} open · ${data.day.receipt_counter} receipts` : "none open (opens with the first sale)"}</div>
        <div>Receipts waiting for device: {data?.tally["awaiting_device"] ?? 0} · queued to send: {data?.tally["queued"] ?? 0} · sent: {data?.tally["submitted"] ?? 0} · failed: {data?.tally["failed"] ?? 0}</div>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={busy}>Save ZIMRA settings</Button>
          {data?.day && <Button type="button" variant="outline" onClick={closeDay}>Close fiscal day</Button>}
        </div>
      )}
    </div>
  );
}

export function ZimraReceiptBlock({ saleNumber }: { saleNumber: string }) {
  const { data } = useQuery({
    queryKey: ["zimra-receipt", saleNumber],
    queryFn: async () => {
      const { data } = await supabase.from("zimra_receipts").select("day_no, receipt_counter, global_no, receipt_hash, status, sales!inner(sale_number)").eq("sales.sale_number", saleNumber).maybeSingle();
      return data;
    },
  });
  if (!data) return null;
  const code = data.receipt_hash.slice(0, 16).toUpperCase().match(/.{4}/g)!.join("-");
  return (
    <div className="mt-2 text-center">
      <div>Fiscal day {data.day_no} · Receipt {data.receipt_counter}/{data.global_no}</div>
      <div>Verification code: {code}</div>
      {data.status !== "submitted" && <div className="opacity-70">Fiscal signature pending</div>}
    </div>
  );
}
