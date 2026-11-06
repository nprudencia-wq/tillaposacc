import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cached, setOfflineScope } from "@/lib/offline";
import { effectivePermission, type Permission } from "@/lib/username";

export function useStaff() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => cached("me", async () => {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) { setOfflineScope(null); return null; }
      const membershipKey = `tilla-membership:${user.id}`;
      const { data: membership, error: membershipError } = await supabase.from("store_memberships").select("store_id").eq("user_id", user.id).single();
      let storeId = membership?.store_id;
      if (storeId) localStorage.setItem(membershipKey, storeId);
      else if (!navigator.onLine) storeId = localStorage.getItem(membershipKey) ?? undefined;
      if (!storeId) throw membershipError ?? new Error("No store membership found");
      setOfflineScope({ storeId, userId: user.id });
      const [{ data: roles, error }, { data: profile }, { data: perms }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("full_name, username, active").eq("id", user.id).maybeSingle(),
        supabase.from("user_permissions").select("permission, allowed").eq("user_id", user.id),
      ]);
      if (error) throw error;
      const list = (roles ?? []).map((r) => r.role as string);
      const overrides = Object.fromEntries((perms ?? []).map((p) => [p.permission, p.allowed])) as Partial<Record<Permission, boolean>>;
      const can = (p: Permission) => profile?.active !== false && effectivePermission(list, p, overrides);
      return {
        id: user.id,
        storeId,
        email: user.email ?? "",
        name: profile?.full_name || profile?.username || user.email || "",
        roles: list,
        username: profile?.username ?? "",
        active: profile?.active !== false,
        canManageStock: can("manage_stock"),
        canRefund: can("refund"),
        canDiscount: can("give_discount"),
        canPostExpense: can("post_expense"),
        canViewReports: can("view_reports"),
        canOverridePrice: can("override_price"),
        canManageStaff: list.some((r) => ["admin", "owner", "manager"].includes(r)),
        canManagePaymentTypes: list.some((r) => ["admin", "owner", "manager"].includes(r)),
        isOwner: list.some((r) => ["admin", "owner"].includes(r)),
        // Cashier-only accounts are till users: no back office.
        backOffice: list.some((r) => r !== "cashier"),
      };
    }),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => cached("settings", async () => {
      const { data, error } = await supabase.from("settings").select("*").single();
      if (error) throw error;
      if (!data.store_id) throw new Error("Store settings ownership unavailable");
      const { data: confirmation, error: confirmationError } = await supabase.from("currency_confirmations").select("rand_rate,confirmed_at").eq("store_id", data.store_id).maybeSingle();
      if (confirmationError) throw confirmationError;
      return { ...data, zig_rate: Number(data.zig_rate), rand_rate: Number(data.rand_rate), rand_confirmed_rate: confirmation ? Number(confirmation.rand_rate) : null, rand_confirmed_at: confirmation?.confirmed_at ?? null };
    }),
  });
}
