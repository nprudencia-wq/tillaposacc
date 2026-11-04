import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Customer = { id: string; name: string; phone: string | null; email: string | null; address: string | null; credit_limit: number; notes: string | null; active: boolean };

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, credit_limit: Number(c.credit_limit) })) as Customer[];
    },
  });
}

export function CustomerDialog({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved?: (c: Customer) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "", address: customer?.address ?? "", credit_limit: String(customer?.credit_limit ?? 0), notes: customer?.notes ?? "", active: customer?.active ?? true });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { toast.error("Enter the customer's name"); return; }
    setBusy(true);
    const row = { ...f, name: f.name.trim(), credit_limit: Number(f.credit_limit) || 0 };
    const res = customer
      ? await supabase.from("customers").update(row).eq("id", customer.id).select().single()
      : await supabase.from("customers").insert(row).select().single();
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Customer saved");
    qc.invalidateQueries({ queryKey: ["customers"] });
    onSaved?.({ ...res.data, credit_limit: Number(res.data.credit_limit) } as Customer);
    onClose();
  }
  const fld = (k: "name" | "phone" | "email" | "address" | "notes", label: string) => (
    <div><Label htmlFor={`c-${k}`}>{label}</Label><Input id={`c-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {fld("name", "Name")}{fld("phone", "Mobile number")}{fld("email", "Email")}{fld("address", "Address")}
          <div><Label htmlFor="c-limit">Credit limit (USD, 0 = no limit)</Label><Input id="c-limit" type="number" min={0} value={f.credit_limit} onChange={(e) => setF({ ...f, credit_limit: e.target.value })} /></div>
          {fld("notes", "Notes")}
          {customer && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Can buy on account</label>}
          <Button type="submit" className="w-full" disabled={busy}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

