import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePaymentTypes, type PaymentType } from "@/lib/payment-types";

export const Route = createFileRoute("/_authenticated/payment-types")({
  head: () => ({
    meta: [
      { title: "Payment types — Tilla POS" },
      { name: "description", content: "Choose how customers can pay: cash, mobile money, cards, or your own types." },
    ],
  }),
  component: PaymentTypesPage,
});

function PaymentTypesPage() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const { data: types = [] } = usePaymentTypes();
  const can = !!me?.canManagePaymentTypes;
  const [name, setName] = useState("");
  const [cash, setCash] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["payment-types"] });

  async function add() {
    const n = name.trim();
    if (!n) { toast.error("Give the payment type a name"); return; }
    if (types.some((t) => t.name.toLowerCase() === n.toLowerCase())) { toast.error(`${n} is already on the list`); return; }
    setBusy(true);
    // code is left empty on purpose: the database names it and keeps it unique.
    const { error } = await supabase.from("payment_types").insert({
      code: "", name: n, is_cash: cash, sort_order: (types.at(-1)?.sort_order ?? 0) + 1,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setName(""); setCash(false); refresh();
    toast.success(`${n} added`);
  }

  async function patch(t: PaymentType, changes: { name?: string; is_cash?: boolean; active?: boolean; sort_order?: number }) {
    const { error } = await supabase.from("payment_types").update(changes).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  async function move(t: PaymentType, dir: -1 | 1) {
    const list = [...types];
    const i = list.findIndex((x) => x.id === t.id);
    const j = i + dir;
    const a = list[i];
    const b = list[j];
    if (!a || !b) return;
    list[i] = b;
    list[j] = a;
    for (let k = 0; k < list.length; k++) {
      const row = list[k];
      const order = k + 1;
      if (!row || row.sort_order === order) continue;
      const { error } = await supabase.from("payment_types").update({ sort_order: order }).eq("id", row.id);
      if (error) { toast.error(error.message); return; }
    }
    refresh();
  }

  async function remove(t: PaymentType) {
    const { error } = await supabase.from("payment_types").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    refresh();
    toast.success(`${t.name} removed`);
  }

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <h1 className="text-3xl font-bold">Payment types</h1>
      <p className="mt-1 text-muted-foreground">How customers can pay. These names appear at the till, on expenses and when paying suppliers.</p>

      {can && (
        <div className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4 shadow-soft">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="pt-name">New payment type</Label>
            <Input id="pt-name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()} placeholder="e.g. EcoCash, InnBucks, Zipit" className="bg-card" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="pt-cash" checked={cash} onCheckedChange={setCash} />
            <Label htmlFor="pt-cash" className="cursor-pointer font-normal">Counts as cash in the drawer</Label>
          </div>
          <Button onClick={add} disabled={busy}><Plus className="h-4 w-4" />Add</Button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name shown at the till</TableHead>
              <TableHead className="text-center">Cash in drawer</TableHead>
              <TableHead className="text-center">Offered at the till</TableHead>
              <TableHead className="text-center">Order</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{can ? <NameCell t={t} onRename={(n) => patch(t, { name: n })} /> : t.name}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={t.is_cash} disabled={!can} onCheckedChange={(v) => patch(t, { is_cash: v })}
                    aria-label={`Toggle whether ${t.name} counts as cash in the drawer`} />
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={t.active} disabled={!can} onCheckedChange={(v) => patch(t, { active: v })}
                    aria-label={`Toggle whether ${t.name} is offered at the till`} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-center">
                  <Button size="icon" variant="ghost" disabled={!can} aria-label={`Move ${t.name} up`} onClick={() => move(t, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" disabled={!can} aria-label={`Move ${t.name} down`} onClick={() => move(t, 1)}><ArrowDown className="h-4 w-4" /></Button>
                </TableCell>
                <TableCell className="text-right">
                  {can && <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
            {!types.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No payment types yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Switching a type off hides it from the till but keeps past records. A type already used on a sale, refund or expense cannot be deleted — switch it off instead.
        Changing which types count as cash can alter the figures shown for shifts you have already closed.
      </p>
      {!can && <p className="mt-2 text-sm text-muted-foreground">Only the owner, administrator or manager can change this list.</p>}
    </div>
  );
}

function NameCell({ t, onRename }: { t: PaymentType; onRename: (n: string) => void }) {
  const [v, setV] = useState(t.name);
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = v.trim(); if (n && n !== t.name) onRename(n); else setV(t.name); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-9 max-w-[260px] bg-card"
      aria-label={`Name of ${t.name}`}
    />
  );
}
