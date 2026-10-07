import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gera um novo token do Desktop Agent (o anterior deixa de valer). */
export const createAgentToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const raw = "lia_" + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("os_agent_tokens")
      .upsert({ user_id: context.userId, token_hash: await sha256(raw), last_seen: null, platform: null });
    if (error) throw new Error("Não foi possível gerar o token");
    return { token: raw };
  });

export const getAgentState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: tok }, { data: actions }] = await Promise.all([
      context.supabase.from("os_agent_tokens").select("last_seen, platform").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("os_actions").select("id, target, action, payload, status, result, created_at").order("created_at", { ascending: false }).limit(15),
    ]);
    return {
      hasToken: !!tok,
      lastSeen: tok?.last_seen ?? null,
      platform: tok?.platform ?? null,
      actions: (actions ?? []).map((a) => ({ ...a, payload: JSON.stringify(a.payload) })),
    };
  });

export const decideAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("os_actions")
      .update({ status: data.approve ? "approved" : "rejected", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending");
    return { ok: true };
  });
