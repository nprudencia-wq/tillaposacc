import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STOCK_ROLES } from "@/lib/pos";

export function useStaff() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return null;
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      const list = (roles ?? []).map((r) => r.role as string);
      return {
        id: user.id,
        email: user.email ?? "",
        name: profile?.full_name || user.email || "",
        roles: list,
        canManageStock: list.some((r) => STOCK_ROLES.includes(r)),
        canRefund: list.some((r) => ["admin", "owner", "manager", "supervisor"].includes(r)),
        isOwner: list.some((r) => ["admin", "owner"].includes(r)),
      };
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return { ...data, zig_rate: Number(data.zig_rate) };
    },
  });
}
