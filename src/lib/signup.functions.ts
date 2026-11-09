import { createServerFn } from "@tanstack/react-start";
import { validateSignup, type SignupInput } from "@/lib/signup";

/** Public: creates a separate trial store (14 days, starter catalog) and its owner account. */
export const signupStore = createServerFn({ method: "POST" })
  .inputValidator((d: SignupInput) => validateSignup(d))
  .handler(async ({ data }) => {
    if (data.website) throw new Error("Sign-up failed"); // bot honeypot
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const { data: storeId, error: storeError } = await supabaseAdmin.rpc("create_trial_store", {
      p_name: data.shopName.trim(), p_phone: data.phone.trim(), p_email: email,
    });
    if (storeError) console.error("create_trial_store failed", storeError.message);
    if (storeError || !storeId) throw new Error("Could not create your shop. Please try again. " + (storeError?.message ?? ""));
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.ownerName.trim(), username: email },
      app_metadata: { initial_role: "owner", store_id: storeId },
    });
    if (error) {
      throw new Error(/already|exists|duplicate|registered/i.test(error.message) ? "An account with that email already exists. Sign in instead." : "Could not create your account. Please try again.");
    }
    return { ok: true, email };
  });
