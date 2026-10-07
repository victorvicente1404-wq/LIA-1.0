import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pushToUser } from "./webpush.server";

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        endpoint: z.string().url().max(1000),
        p256dh: z.string().min(10).max(200),
        auth: z.string().min(4).max(100),
        userAgent: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      { user_id: context.userId, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth, user_agent: data.userAgent ?? null },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error("Não foi possível salvar a inscrição.");
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const sendSelfPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ title: z.string().min(1).max(80), body: z.string().max(300), tag: z.string().max(40).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sent = await pushToUser(context.userId, { title: `Lia • ${data.title}`, body: data.body, url: "/", tag: data.tag });
    return { sent };
  });

const RoutineSchema = z.object({
  title: z.string().min(1).max(120),
  time_hm: z.string().regex(/^\d{2}:\d{2}$/),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
});

export const listRoutines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("push_routines").select("id, title, time_hm, weekdays, is_active").order("time_hm");
    return data ?? [];
  });

export const addRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RoutineSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tz = "America/Sao_Paulo";
    const { error } = await context.supabase.from("push_routines").insert({ ...data, user_id: context.userId, timezone: tz });
    if (error) throw new Error("Não foi possível salvar a rotina.");
    return { ok: true };
  });

export const deleteRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_routines").delete().eq("id", data.id);
    return { ok: true };
  });
