import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cached, setOfflineScope, isNetworkError } from "@/lib/offline";
import { internetAvailable, networkRead } from "@/lib/connectivity";
import { deviceSession } from "@/lib/offline-session";
import { PERMISSIONS, effectivePermission, type Permission } from "@/lib/username";

export function useStaff() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchStaff,
  });
}

export async function fetchStaff() {
      // Restore this cashier's store scope first so the saved profile can be read offline.
      const u = (await deviceSession())?.user;
      const savedStore = u ? localStorage.getItem(`tilla-membership:${u.id}`) : null;
      if (!u) { setOfflineScope(null); return null; }
      // Resolve ownership BEFORE cached() computes its key on a first sign-in.
      let resolvedStore = savedStore;
      if (internetAvailable()) {
        try {
          const { data, error } = await networkRead(() => supabase.from("store_memberships").select("store_id").eq("user_id", u.id).single());
          if (error) throw error;
          if (!data?.store_id) throw new Error("No store membership found");
          resolvedStore = data.store_id;
          localStorage.setItem(`tilla-membership:${u.id}`, resolvedStore);
        } catch (error) { if (!isNetworkError(error) || !resolvedStore) throw error; }
      }
      if (!resolvedStore) throw new Error("Connect once to download your store account on this till.");
      setOfflineScope({ storeId: resolvedStore, userId: u.id });
      if (u && savedStore) setOfflineScope({ storeId: savedStore, userId: u.id });
      return cached("me", async () => {
      const user = u;
      if (!user) { setOfflineScope(null); return null; }
      const storeId = resolvedStore;
      setOfflineScope({ storeId, userId: user.id });
      const [{ data: roles, error }, { data: profile, error: profileError }, { data: perms, error: permissionsError }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("full_name, username, active").eq("id", user.id).maybeSingle(),
        supabase.from("user_permissions").select("permission, allowed").eq("user_id", user.id),
      ]);
      if (error) throw error;
      if (profileError) throw profileError;
      if (permissionsError) throw permissionsError;
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
        perms: Object.fromEntries((Object.keys(PERMISSIONS) as Permission[]).map((p) => [p, can(p)])) as Record<Permission, boolean>,
        backOffice: list.some((r) => r !== "cashier") || (Object.keys(overrides) as Permission[]).some((p) => (p.startsWith("module_") || p === "view_reports") && overrides[p]),
      };
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
