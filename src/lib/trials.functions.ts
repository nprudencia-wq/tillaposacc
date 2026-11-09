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
