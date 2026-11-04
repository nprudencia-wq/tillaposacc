import { createServerFn } from "@tanstack/react-start";
import { isValidPin } from "@/lib/username";

// Public on purpose (staff aren't signed in yet). The PIN is checked in the database,
// which locks the account for 5 minutes after 5 wrong tries.
export const pinLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; pin: string }) => {
    if (!d.username?.trim() || !isValidPin(d.pin)) throw new Error("Wrong username or PIN");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userId, error } = await supabaseAdmin.rpc("check_staff_pin", { p_username: data.username, p_pin: data.pin });
    if (error) throw new Error(error.message);
    if (!userId) throw new Error("Wrong username or PIN");
    const { data: u, error: ue } = await supabaseAdmin.auth.admin.getUserById(userId as string);
    if (ue || !u.user?.email) throw new Error("This account can't use a PIN");
    const { data: link, error: le } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
    if (le || !link.properties?.hashed_token) throw new Error("Couldn't sign in, try your password");
    return { tokenHash: link.properties.hashed_token };
  });
