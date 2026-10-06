/** Execução segura das extensões dinâmicas (somente servidor). */
import { jsonSchema, tool } from "ai";
import { z } from "zod";
import type { CustomApi } from "./types";
import { CustomApiSchema } from "./custom-apis";

const MAX_BYTES = 20_000;

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

export function assertSafeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Só endereços http ou https.");
  if (isPrivateHost(url.hostname)) throw new Error("Endereços internos ou privados não são permitidos.");
  return url;
}

async function readLimited(res: Response): Promise<string> {
  const text = await res.text();
  return text.length > MAX_BYTES ? `${text.slice(0, MAX_BYTES)}\n…(resposta cortada)` : text;
}

/** Chama uma API do tipo "tool" com os parâmetros recebidos. */
export async function callCustomTool(api: CustomApi, params: Record<string, unknown>, timeoutMs = 15_000) {
  const url = assertSafeUrl(api.api_url);
  const loc = api.param_location === "auto" ? (api.method === "GET" || api.method === "DELETE" ? "query" : "body") : api.param_location;
  const headers = new Headers(api.headers);
  let body: string | null = null;
  if (loc === "query") {
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  } else if (api.method !== "GET") {
    body = JSON.stringify(params ?? {});
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const started = Date.now();
  const res = await fetch(url, { method: api.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  return { ok: res.ok, status: res.status, ms: Date.now() - started, body: await readLimited(res) };
}

type Msg = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };

const flatten = (c: Msg["content"]) =>
  typeof c === "string" ? c : c.filter((p) => p["type"] === "text").map((p) => String(p["text"] ?? "")).join("\n");

/** Chama um provedor compatível com OpenAI (/chat/completions). */
export async function callCustomProvider(api: CustomApi, system: string, messages: Msg[], timeoutMs = 7_000): Promise<string> {
  const url = assertSafeUrl(api.api_url);
  if (!/\/chat\/completions\/?$/.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
  const headers = new Headers(api.headers);
  headers.set("content-type", "application/json");
  const res = await fetch(url, {
    method: "POST",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: api.model_name || undefined,
      messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: flatten(m.content) }))],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("resposta vazia");
  return text;
}

/** Converte as APIs ativas em ferramentas + meta-ferramenta de cadastro. */
export function buildCustomTools(apis: CustomApi[]) {
  const tools: Record<string, unknown> = {};
  for (const api of apis.filter((a) => a.type === "tool" && a.is_active)) {
    const schema = (api.parameters_schema?.["type"] === "object" ? api.parameters_schema : { type: "object", properties: {} }) as never;
    tools[`ext_${api.name}`] = tool({
      description: `${api.display_name || api.name}: ${api.description}`.slice(0, 1000),
      inputSchema: jsonSchema<Record<string, unknown>>(schema),
      execute: async (params) => {
        try {
          return await callCustomTool(api, params);
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
    });
  }
  tools["register_new_api_tool"] = tool({
    description:
      "Cadastra uma nova API externa quando o usuário pedir explicitamente. type 'tool' para ações (busca, webhooks) ou 'llm_provider' para modelo de IA compatível com OpenAI. Depois explique brevemente para que serve e confirme que está pronta.",
    inputSchema: z.object({
      name: z.string().describe("identificador sem espaços, ex: web_search"),
      display_name: z.string(),
      type: z.enum(["tool", "llm_provider"]),
      description: z.string(),
      api_url: z.string(),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
      param_location: z.enum(["auto", "body", "query"]).default("auto"),
      headers: z.record(z.string(), z.string()).default({}),
      parameters_schema: z.record(z.string(), z.unknown()).default({ type: "object", properties: {} }),
      model_name: z.string().optional(),
    }),
    execute: async (input) => {
      const api = { ...input, id: crypto.randomUUID(), priority: 99, is_active: true, model_name: input.model_name ?? null };
      const parsed = CustomApiSchema.safeParse(api);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "dados inválidos" };
      try {
        assertSafeUrl(api.api_url);
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
      return { ok: true, registered: parsed.data };
    },
  });
  return tools;
}
