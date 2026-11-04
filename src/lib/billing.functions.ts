import { createServerFn } from "@tanstack/react-start";

// Vendor-only actions. Guarded by the VENDOR_CODE secret, which only the software provider knows,
// so a shop owner can never approve their own subscription payment.
function checkCode(code: string) {
  const real = process.env["VENDOR_CODE"];
  if (!real) throw new Error("Vendor code is not set up yet");
  if (!code || code !== real) throw new Error("Wrong vendor code");
}

export const vendorDecide = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; paymentId: string; approve: boolean; note?: string }) => d)
  .handler(async ({ data }) => {
    checkCode(data.code);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("decide_subscription_payment", {
      p_payment: data.paymentId, p_approve: data.approve, p_note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const vendorUpdatePlan = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; price: number; grace: number; paidUntil: string; vendor: string; details: string }) => {
    if (!(d.price > 0) || d.grace < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(d.paidUntil)) throw new Error("Check the plan details");
    return d;
  })
  .handler(async ({ data }) => {
    checkCode(data.code);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("vendor_update_plan", {
      p_price: data.price, p_grace: data.grace, p_paid_until: data.paidUntil, p_vendor: data.vendor, p_details: data.details,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
