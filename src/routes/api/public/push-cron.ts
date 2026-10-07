import { createFileRoute } from "@tanstack/react-router";

function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hm: `${g("hour").replace("24", "00")}:${g("minute")}`, wd };
}

export const Route = createFileRoute("/api/public/push-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pushToUser } = await import("@/lib/lia/webpush.server");
        const { data: cfg } = await supabaseAdmin.from("push_cron_config").select("secret").eq("id", 1).single();
        const given = request.headers.get("x-cron-secret") ?? "";
        if (!cfg?.secret || given.length !== cfg.secret.length || given !== cfg.secret) {
          return new Response("unauthorized", { status: 401 });
        }

        const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("user_id");
        const users = [...new Set((subs ?? []).map((s) => s.user_id))];
        let sent = 0;

        // Rotinas
        const { data: routines } = await supabaseAdmin.from("push_routines").select("*").eq("is_active", true).in("user_id", users.length ? users : ["00000000-0000-0000-0000-000000000000"]);
        for (const r of routines ?? []) {
          const now = localParts(r.timezone);
          if (now.hm < r.time_hm || r.last_sent_on === now.date || !r.weekdays.includes(now.wd)) continue;
          await supabaseAdmin.from("push_routines").update({ last_sent_on: now.date }).eq("id", r.id);
          sent += await pushToUser(r.user_id, { title: "Lia • Rotina", body: r.title, url: "/", tag: `rotina-${r.id}` });
        }

        // Agenda: 15 minutos antes
        const { data: cal } = await supabaseAdmin.from("app_user_connections").select("user_id").eq("connector_id", "google_calendar").in("user_id", users.length ? users : ["00000000-0000-0000-0000-000000000000"]);
        if (cal?.length) {
          const { fetchUpcomingEvents } = await import("@/server/connectors.server");
          for (const { user_id } of cal) {
            try {
              const events = await fetchUpcomingEvents(user_id, 5);
              for (const e of events) {
                const start = Date.parse(e.start);
                const mins = (start - Date.now()) / 60000;
                if (!e.start.includes("T") || mins < 0 || mins > 15) continue;
                const { error } = await supabaseAdmin.from("push_sent_events").insert({ user_id, event_key: `cal-${e.id}-${e.start}` });
                if (error) continue; // já avisado
                const hm = new Date(start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                sent += await pushToUser(user_id, { title: "Lia • Agenda", body: `${e.title} às ${hm}${e.location ? ` — ${e.location}` : ""}`, url: "/", tag: `cal-${e.id}` });
              }
            } catch (err) {
              console.warn("cron agenda:", (err as Error).message);
            }
          }
        }
        return Response.json({ ok: true, sent });
      },
    },
  },
});
