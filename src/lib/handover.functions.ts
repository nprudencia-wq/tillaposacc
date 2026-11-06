import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INSTRUCTIONS = `You write shift handover notes for a Zimbabwean retail shop manager.
Use the shift figures and the manager's notes. Be short, plain and practical. Use these headings:
**Cash & drawer** – variances in USD/ZiG/Rand and what to check.
**Sales** – one or two lines on trading.
**Issues raised** – from the notes (stock, equipment, customers, staff).
**Next shift: to do** – a numbered checklist of concrete actions, most urgent first.
Never invent facts not in the data. If something is unknown, leave it out.`;

export const generateShiftHandover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shiftId: string; notes: string }) => {
    if (!d.shiftId) throw new Error("Pick a shift");
    if ((d.notes ?? "").length > 4000) throw new Error("Notes are too long (4000 characters max)");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: refund }, { data: exp }] = await Promise.all([
      sb.rpc("can_refund", { _user_id: context.userId }),
      sb.rpc("can_post_expense", { _user_id: context.userId }),
    ]);
    if (!refund && !exp) throw new Error("Only managers or supervisors can create handovers");
    const { data: s, error } = await sb.from("cashier_shifts").select("*").eq("id", data.shiftId).single();
    if (error || !s) throw new Error("Shift not found");
    const [{ data: cashier }, { data: sales }, { data: moves }] = await Promise.all([
      sb.from("profiles").select("full_name").eq("id", s.cashier_id).maybeSingle(),
      sb.from("sales").select("total, offline").eq("shift_id", s.id),
      sb.from("shift_cash_movements").select("type, currency, amount, reason").eq("shift_id", s.id),
    ]);
    const facts = {
      shift: s.shift_number, cashier: cashier?.full_name ?? "Staff", status: s.status,
      opened_at: s.opened_at, closed_at: s.closed_at,
      sales_count: sales?.length ?? 0,
      sales_total_usd: Math.round((sales ?? []).reduce((a, r) => a + Number(r.total), 0) * 100) / 100,
      offline_sales: (sales ?? []).filter((r) => r.offline).length,
      variance: { usd: s.variance_usd, zig: s.variance_zig, rand: s.variance_zar },
      cash_movements: moves ?? [], cashier_closing_note: s.notes,
    };
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1", apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        system: INSTRUCTIONS,
        prompt: `Shift data (JSON):\n${JSON.stringify(facts)}\n\nManager notes:\n${data.notes || "(none)"}`,
        maxRetries: 0,
        providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } },
      });
      const text = (await result.text).trim();
      if (!text) throw new Error("The AI returned no summary. Try again later.");
      return { summary: text };
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode;
      if (st === 429) throw new Error("AI is busy right now. Wait a minute and try again.");
      if (st === 402) throw new Error("AI credits have run out. Top up in Settings → Plans & credits.");
      console.error("handover AI error", e);
      throw new Error((e as Error).message || "Could not create the handover");
    }
  });
