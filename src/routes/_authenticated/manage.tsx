import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";
import { roleLabels } from "@/lib/pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manage")({
  head: () => ({
    meta: [
      { title: "Quick edit — Tilla POS Back Office" },
      { name: "description", content: "Managers quickly edit products, prices and cashier roles." },
      { property: "og:title", content: "Quick edit — Tilla POS Back Office" },
      { property: "og:description", content: "Managers quickly edit products, prices and cashier roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagePage,
});

const SENIOR = ["admin", "owner", "manager"];
type Product = { id: string; name: string; sku: string | null; barcode: string | null; description: string | null; category_id: string | null; image_url: string | null; cost_price: number; selling_price: number; wholesale_price: number; min_stock: number; max_stock: number; active: boolean; stock: number };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";

function ManagePage() {
  const [tab, setTab] = useState<"products" | "staff">("products");
  return (
    <div className="min-h-full bg-sidebar p-4 text-sidebar-foreground md:p-6">
      <h1 className="font-display text-2xl font-bold">Quick edit</h1>
      <p className="text-sm opacity-70">Change products, prices and cashier roles in one place.</p>
      <div className="mt-4 grid max-w-md grid-cols-2 gap-2">
        {([["products", "Products & prices", Boxes], ["staff", "Cashier roles", Users]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "bg-sidebar-accent"}`}>
            <I className="h-5 w-5" />{l}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-card p-4 text-card-foreground shadow-soft">{tab === "products" ? <Products /> : <Roles />}</div>
    </div>
  );
}

function Products() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<Product>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["manage-products"],
    queryFn: async () => (await supabase.from("products").select("id,name,sku,barcode,description,category_id,image_url,cost_price,selling_price,wholesale_price,min_stock,max_stock,active,stock").order("name")).data as Product[] ?? [],
  });
  const list = data.filter((p) => !q || `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const set = (id: string, k: keyof Product, v: unknown) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));

  async function save(p: Product) {
    const f = { ...p, ...edits[p.id] };
    if (!String(f.name).trim()) { toast.error("Name is required"); return; }
    setBusy(p.id);
    const fields = { name: f.name, sku: f.sku, barcode: f.barcode, description: f.description, category_id: f.category_id, image_url: f.image_url,
      cost_price: Number(f.cost_price || 0), selling_price: Number(f.selling_price || 0), wholesale_price: Number(f.wholesale_price || 0),
      min_stock: Number(f.min_stock || 0), max_stock: Number(f.max_stock || 0), active: f.active };
    const { error } = await supabase.rpc("save_inventory_product", { p_id: p.id, p_fields: fields, p_stock: Number(p.stock), p_expected_stock: Number(p.stock), p_reason: "Quick edit" });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${f.name} saved`);
    setEdits((e) => { const n = { ...e }; delete n[p.id]; return n; });
    void qc.invalidateQueries({ queryKey: ["manage-products"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="space-y-3">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 opacity-50" /><Input className="h-11 pl-9" placeholder="Search product, SKU or barcode" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">Stock levels are changed in Inventory or Stock control, so the stock history stays correct.</p>
      <div className="divide-y">
        {list.map((p) => {
          const f = { ...p, ...edits[p.id] };
          const dirty = !!edits[p.id];
          return (
            <div key={p.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_7rem_7rem_auto_auto] sm:items-end">
              <label className="text-xs text-muted-foreground">Name<Input className="mt-1 h-11 text-base text-foreground" value={f.name} onChange={(e) => set(p.id, "name", e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Cost US$<Input className="mt-1 h-11 text-base text-foreground" type="number" min={0} step="0.01" value={f.cost_price} onChange={(e) => set(p.id, "cost_price", e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Selling US$<Input className="mt-1 h-11 text-base font-semibold text-foreground" type="number" min={0} step="0.01" value={f.selling_price} onChange={(e) => set(p.id, "selling_price", e.target.value)} /></label>
              <Button variant={f.active ? "outline" : "secondary"} className="h-11" onClick={() => set(p.id, "active", !f.active)}>{f.active ? "On sale" : "Hidden"}</Button>
              <Button className="h-11" disabled={!dirty || busy === p.id} onClick={() => save(p)}>{busy === p.id ? "Saving…" : "Save"}</Button>
            </div>
          );
        })}
        {!list.length && <p className="py-6 text-center text-sm text-muted-foreground">No products found.</p>}
      </div>
    </div>
  );
}

function Roles() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["manage-roles"],
    queryFn: async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, username, active").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (p ?? []).map((x) => ({ ...x, role: (r ?? []).find((y) => y.user_id === x.id)?.role as string | undefined }));
    },
  });
  const choices = Object.entries(roleLabels).filter(([k]) => me?.isOwner || !SENIOR.includes(k));
  async function change(id: string, role: string) {
    const { error } = await supabase.rpc("set_user_role", { p_user: id, p_role: role as never });
    if (error) { toast.error(error.message); return; }
    toast.success("Role updated");
    void qc.invalidateQueries({ queryKey: ["manage-roles"] });
    void qc.invalidateQueries({ queryKey: ["staff-list"] });
  }
  if (!me?.canManageStaff) return <p className="text-sm text-muted-foreground">Only owners and managers can change roles.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((s) => {
        const editable = s.id !== me.id && (me.isOwner || !SENIOR.includes(s.role ?? ""));
        return (
          <div key={s.id} className={`flex items-center gap-3 rounded-xl border p-3 ${s.active ? "" : "opacity-50"}`}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{initials(s.full_name)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{s.full_name}</div>
              <div className="truncate text-xs text-muted-foreground">{s.username ?? ""}</div>
              {editable ? (
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={s.role ?? ""} onChange={(e) => change(s.id, e.target.value)}>
                  {choices.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              ) : <div className="mt-1 text-sm">{s.role ? roleLabels[s.role] ?? s.role : "—"}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
