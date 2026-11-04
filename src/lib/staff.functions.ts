import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidUsername, loginEmail, normalizeUsername } from "@/lib/username";

const ROLES = ["admin", "owner", "manager", "supervisor", "cashier", "stock_controller", "accountant"] as const;
const SENIOR = ["admin", "owner", "manager"];

async function assertCanManage(supabase: any, userId: string, targetRole?: string, targetUser?: string) {
  const { data: ok } = await supabase.rpc("can_manage_staff", { _user_id: userId });
  if (!ok) throw new Error("Only an owner, administrator or manager can do this");
  const { data: owner } = await supabase.rpc("is_owner_admin", { _user_id: userId });
  if (owner) return;
  if (targetRole && SENIOR.includes(targetRole)) throw new Error("Managers can only create staff below manager");
  if (targetUser) {
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", targetUser);
    if ((r ?? []).some((x: { role: string }) => SENIOR.includes(x.role))) throw new Error("Managers can only reset passwords for their staff");
  }
}

export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; fullName: string; password: string; role: string }) => {
    if (!isValidUsername(d.username)) throw new Error("Username must be 3–30 letters, numbers, dots, dashes or underscores");
    if (!d.fullName?.trim()) throw new Error("Enter the person's name");
    if (!d.password || d.password.length < 6) throw new Error("Password must be at least 6 characters");
    if (!ROLES.includes(d.role as never)) throw new Error("Pick a role");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId, data.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = normalizeUsername(data.username);
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail(username), password: data.password, email_confirm: true,
      user_metadata: { full_name: data.fullName.trim(), username },
      app_metadata: { initial_role: data.role },
    });
    if (error) throw new Error(/already|exists|duplicate/i.test(error.message) ? "That username is taken" : error.message);
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => {
    if (!d.password || d.password.length < 6) throw new Error("Password must be at least 6 characters");
    return d;
  })
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("Change your own password from your account");
    await assertCanManage(context.supabase, context.userId, undefined, data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
