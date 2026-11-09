import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrialLead = {
  id: string; shop: string; phone: string; email: string; signedUp: string; trialEnds: string | null;
  daysLeft: number | null; status: "active" | "expired" | "paid"; sales: number; lastSale: string | null; products: number;
};

/** Vendor-only: lists self-serve trial shops. Caller must be owner/admin of the vendor store. */
export const listTrialLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: mem }, { data: roles }] = await Promise.all([
      supabase.from("store_memberships").select("store_id").eq("user_id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (!mem?.store_id || !(roles ?? []).some((r) => ["owner", "admin"].includes(r.role as string))) throw new Error("Only the Tilla vendor can view trial leads");
    const { data: own } = await supabase.from("stores").select("is_vendor_store").eq("id", mem.store_id).single();
    if (!own?.is_vendor_store) throw new Error("Only the Tilla vendor can view trial leads");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: stores, error } = await supabaseAdmin.from("stores").select("id, name, created_at, trial_ends_at")
      .eq("is_vendor_store", false).order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const ids = (stores ?? []).map((s) => s.id);
    if (!ids.length) return [] as TrialLead[];
    const [{ data: settings }, { data: sales }, { data: products }] = await Promise.all([
      supabaseAdmin.from("settings").select("store_id, phone, email, paid_until").in("store_id", ids),
      supabaseAdmin.from("sales").select("store_id, created_at").in("store_id", ids).order("created_at", { ascending: false }).limit(20000),
      supabaseAdmin.from("products").select("store_id").in("store_id", ids).limit(20000),
    ]);
    const now = Date.now();
    return (stores ?? []).map((s): TrialLead => {
      const st = (settings ?? []).find((x) => x.store_id === s.id) as { phone?: string; email?: string; paid_until?: string | null } | undefined;
      const mine = (sales ?? []).filter((x) => x.store_id === s.id);
      const daysLeft = s.trial_ends_at ? Math.ceil((new Date(s.trial_ends_at).getTime() - now) / 86400000) : null;
      const paid = !!st?.paid_until && s.trial_ends_at != null && new Date(st.paid_until).getTime() > new Date(s.trial_ends_at).getTime();
      return {
        id: s.id, shop: s.name, phone: st?.phone ?? "", email: st?.email ?? "", signedUp: s.created_at, trialEnds: s.trial_ends_at,
        daysLeft, status: paid ? "paid" : daysLeft != null && daysLeft < 0 ? "expired" : "active",
        sales: mine.length, lastSale: mine[0]?.created_at ?? null,
        products: (products ?? []).filter((p) => p.store_id === s.id).length,
      };
    });
  });

type Ctx = { supabase: any; userId: string };
async function assertVendor({ supabase, userId }: Ctx) {
  const [{ data: mem }, { data: roles }] = await Promise.all([
    supabase.from("store_memberships").select("store_id").eq("user_id", userId).single(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (!mem?.store_id || !((roles ?? []) as { role: string }[]).some((r) => ["owner", "admin"].includes(r.role))) throw new Error("Only the Tilla vendor can do this");
  const { data: own } = await supabase.from("stores").select("is_vendor_store").eq("id", mem.store_id).single();
  if (!own?.is_vendor_store) throw new Error("Only the Tilla vendor can do this");
}

export type PendingSubPayment = { id: string; shop: string; invoice: string; months: number; tills: number; amount: number; method: string; reference: string; phone: string | null; submitted: string };

/** Vendor-only: subscription payments from any shop awaiting confirmation. */
export const listPendingSubPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertVendor(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("subscription_payments")
      .select("id, invoice_number, months, tills, amount, method, reference, payer_phone, submitted_at, store_id, stores(name)")
      .eq("status", "pending").order("submitted_at").limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any): PendingSubPayment => ({
      id: p.id, shop: p.stores?.name ?? "—", invoice: p.invoice_number, months: p.months, tills: p.tills, amount: Number(p.amount),
      method: p.method, reference: p.reference, phone: p.payer_phone, submitted: p.submitted_at,
    }));
  });

/** Vendor-only: approve (extends that shop's paid-until) or reject a subscription payment. */
export const decideSubPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d.id)) throw new Error("Bad payment");
    return { id: d.id, approve: !!d.approve };
  })
  .handler(async ({ context, data }) => {
    await assertVendor(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("decide_subscription_payment", { p_payment: data.id, p_approve: data.approve, p_note: "" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
