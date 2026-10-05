/** Extensões dinâmicas: esquema compartilhado (cliente e servidor) e sincronização com a conta. */
import { z } from "zod";
import type { CustomApi } from "./types";

export const CustomApiSchema = z.object({
  id: z.string().min(1).max(64),
  name: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Use letras, números e _ (sem espaços)."),
  display_name: z.string().max(80),
  type: z.enum(["tool", "llm_provider"]),
  description: z.string().max(1000),
  api_url: z.string().url().max(500),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  param_location: z.enum(["auto", "body", "query"]),
  headers: z.record(z.string(), z.string().max(2000)),
  parameters_schema: z.record(z.string(), z.unknown()),
  model_name: z.string().max(120).nullable().optional(),
  priority: z.number().int(),
  is_active: z.boolean(),
});

export const emptyApi = (type: CustomApi["type"], priority = 0): CustomApi => ({
  id: crypto.randomUUID(),
  name: "",
  display_name: "",
  type,
  description: "",
  api_url: "",
  method: type === "llm_provider" ? "POST" : "GET",
  param_location: "auto",
  headers: {},
  parameters_schema: { type: "object", properties: {} },
  model_name: type === "llm_provider" ? "" : null,
  priority,
  is_active: true,
});

/** Mescla por nome: entradas novas são acrescentadas, as atuais são mantidas. */
export function mergeCustomApis(current: CustomApi[] = [], incoming: CustomApi[] = []): CustomApi[] {
  const names = new Set(current.map((a) => a.name));
  return [...current, ...incoming.filter((a) => a && !names.has(a.name))];
}

/** Espelha a lista na conta do usuário (quando logado). Falhas são silenciosas. */
export async function syncCustomApisToAccount(list: CustomApi[]) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) return;
    const rows = list.map((a) => ({
      user_id: userId,
      name: a.name,
      display_name: a.display_name,
      type: a.type,
      description: a.description,
      api_url: a.api_url,
      method: a.method,
      param_location: a.param_location,
      headers: a.headers,
      parameters_schema: a.parameters_schema as never,
      model_name: a.model_name ?? null,
      priority: a.priority,
      is_active: a.is_active,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await supabase.from("custom_api_integrations").upsert(rows, { onConflict: "user_id,name" });
    }
    const keep = list.map((a) => a.name);
    const del = supabase.from("custom_api_integrations").delete().eq("user_id", userId);
    await (keep.length ? del.not("name", "in", `(${keep.map((n) => `"${n}"`).join(",")})`) : del);
  } catch {
    /* sem conta ou offline: o Lia Card continua sendo a fonte portátil */
  }
}

/** Lê as integrações salvas na conta (quando logado). */
export async function loadCustomApisFromAccount(): Promise<CustomApi[]> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.from("custom_api_integrations").select("*");
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      display_name: r.display_name,
      type: r.type as CustomApi["type"],
      description: r.description,
      api_url: r.api_url,
      method: r.method as CustomApi["method"],
      param_location: r.param_location as CustomApi["param_location"],
      headers: (r.headers ?? {}) as Record<string, string>,
      parameters_schema: (r.parameters_schema ?? {}) as Record<string, unknown>,
      model_name: r.model_name,
      priority: r.priority,
      is_active: r.is_active,
    }));
  } catch {
    return [];
  }
}
