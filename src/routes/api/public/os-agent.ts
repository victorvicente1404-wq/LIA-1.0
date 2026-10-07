import { createFileRoute } from "@tanstack/react-router";

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identifica o dono do token do Desktop Agent. */
async function auth(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer lia_") || h.length > 120) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("os_agent_tokens").select("user_id").eq("token_hash", await sha256(h.slice(7))).maybeSingle();
  if (!data) return null;
  await supabaseAdmin
    .from("os_agent_tokens")
    .update({ last_seen: new Date().toISOString(), platform: (request.headers.get("x-platform") ?? "").slice(0, 40) || null })
    .eq("user_id", data.user_id);
  return { userId: data.user_id, admin: supabaseAdmin };
}

export const Route = createFileRoute("/api/public/os-agent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const a = await auth(request);
        if (!a) return new Response("unauthorized", { status: 401 });
        const { data } = await a.admin
          .from("os_actions")
          .update({ status: "running", updated_at: new Date().toISOString() })
          .eq("user_id", a.userId)
          .eq("target", "desktop")
          .eq("status", "approved")
          .select("id, action, payload");
        return Response.json({ actions: data ?? [] });
      },
      POST: async ({ request }) => {
        const a = await auth(request);
        if (!a) return new Response("unauthorized", { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { id?: string; ok?: boolean; result?: string };
        if (!body.id) return new Response("bad request", { status: 400 });
        await a.admin
          .from("os_actions")
          .update({ status: body.ok ? "done" : "failed", result: String(body.result ?? "").slice(0, 2000), updated_at: new Date().toISOString() })
          .eq("id", body.id)
          .eq("user_id", a.userId);
        return Response.json({ ok: true });
      },
    },
  },
});
