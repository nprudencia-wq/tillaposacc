import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cached } from "@/lib/offline";
import { effectivePermission, type Permission } from "@/lib/username";

export function useStaff() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => cached("me", async () => {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) return null;
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
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return { ...data, zig_rate: Number(data.zig_rate) };
    }),
  });
}
