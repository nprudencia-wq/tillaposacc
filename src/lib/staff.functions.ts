import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidUsername, loginEmail, normalizeUsername } from "@/lib/username";

const ROLES = ["admin", "owner", "manager", "supervisor", "cashier", "stock_controller", "accountant"] as const;
const SENIOR = ["admin", "owner", "manager"];

async function assertCanManage(supabase: any, userId: string, targetRole?: string, targetUser?: string) {
  const { data: ok } = await supabase.rpc("can_manage_staff", { _user_id: userId });
  if (!ok) throw new Error("Only an owner, administrator or manager can do this");
  if (targetUser) {
    const { data: membership, error } = await supabase.rpc("can_manage_store_member", { p_target: targetUser });
    if (error || !membership) throw new Error("That staff account does not belong to your store");
  }
  const { data: owner } = await supabase.rpc("is_owner_admin", { _user_id: userId });
  if (owner) return;
  if (targetRole && SENIOR.includes(targetRole)) throw new Error("Managers can only create staff below manager");
  if (targetUser) {
    // Read target roles with the admin client: row policies hide other users' roles from managers.
    // Store membership was already verified above, so this lookup cannot reach another shop.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", targetUser);
    if (roleError) throw new Error("Could not verify that staff member's role");
    if ((r ?? []).some((x: { role: string }) => SENIOR.includes(x.role))) throw new Error("Managers can only reset passwords for their staff");
  }
}

export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; fullName: string; password: string; role: string; pin?: string }) => {
    if (!isValidUsername(d.username)) throw new Error("Username must be 3–30 letters, numbers, dots, dashes or underscores");
    if (!d.fullName?.trim()) throw new Error("Enter the person's name");
    if (!d.password || d.password.length < 6) throw new Error("Password must be at least 6 characters");
    if (!ROLES.includes(d.role as never)) throw new Error("Pick a role");
    if (d.pin && !/^[0-9]{4}$/.test(d.pin)) throw new Error("PIN must be exactly 4 digits");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId, data.role);
    const { data: storeId, error: scopeError } = await context.supabase.rpc("current_store_id");
    if (scopeError || !storeId) throw new Error("Store membership unavailable");
    const { data: store, error: storeError } = await context.supabase.from("stores").select("is_vendor_store").eq("id", storeId).single();
    if (storeError || !store) throw new Error("Store unavailable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = store.is_vendor_store ? normalizeUsername(data.username) : `${storeId.slice(0, 8)}.${normalizeUsername(data.username)}`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail(username), password: data.password, email_confirm: true,
      user_metadata: { full_name: data.fullName.trim(), username },
      app_metadata: { initial_role: data.role, store_id: storeId },
    });
    if (error) throw new Error(/already|exists|duplicate/i.test(error.message) ? "That username is taken" : error.message);
    if (created.user) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("id", created.user.id).maybeSingle();
      if (!prof) {
        const { error: provError } = await supabaseAdmin.auth.admin.updateUserById(created.user.id, { app_metadata: { initial_role: data.role, store_id: storeId } });
        if (provError) { await supabaseAdmin.auth.admin.deleteUser(created.user.id); throw new Error("Could not finish setting up this staff member. Please try again."); }
      }
    }
    let pinSet = false;
    if (data.pin && created.user) {
      const { error: pinError } = await context.supabase.rpc("set_staff_pin", { p_user: created.user.id, p_pin: data.pin });
      pinSet = !pinError;
    }
    return { ok: true, username, pinSet };
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
