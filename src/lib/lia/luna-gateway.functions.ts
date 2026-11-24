/**
 * Provider Gateway da Lia — GPT-6 Luna via Responses API.
 * O segredo e o orçamento autoritativo permanecem no servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  system: z.string().min(1).max(30_000),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(12_000),
  })).min(1).max(8),
  maxOutputTokens: z.number().int().min(64).max(1024).default(768),
});

type Usage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

function readUsage(value: unknown): Usage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
  };
  if (typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number" ||
      !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) return null;
  const cached = usage.input_tokens_details?.cached_tokens;
  return {
    inputTokens: Math.max(0, Math.floor(usage.input_tokens)),
    cachedInputTokens: typeof cached === "number" && Number.isFinite(cached) ? Math.max(0, Math.floor(cached)) : 0,
    outputTokens: Math.max(0, Math.floor(usage.output_tokens)),
  };
}

function readOutput(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output
    .filter((item): item is { type?: string; content?: unknown } => Boolean(item) && typeof item === "object")
    .filter((item) => item.type === "message" && Array.isArray(item.content))
    .flatMap((item) => item.content as Array<{ type?: string; text?: string }>)
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text!)
    .join("")
    .trim();
}

export const callLunaGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, requestStarted: false, usage: null, error: "OPENAI_API_KEY não configurada no servidor." };
    }

    // Recalcula no servidor: o cliente não escolhe o custo da reserva.
    // O fator 0,8 token/caractere é deliberadamente conservador.
    const chars = data.system.length + data.messages.reduce((sum, item) => sum + item.content.length, 0);
    const maxInputTokens = Math.min(150_000, Math.max(512, Math.ceil(chars * 0.8) + 512));
    const maxOutputTokens = data.maxOutputTokens;
    const maxCostUsd = ((maxInputTokens * 0.10) + (maxOutputTokens * 0.50)) / 1_000_000;
    const reservationId = crypto.randomUUID();

    const db = context.supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    const reserved = await db.rpc("lia_reserve_ai_budget", {
      p_reservation_id: reservationId,
      p_estimated_cost_usd: maxCostUsd,
    });
    if (reserved.error || !reserved.data || typeof reserved.data !== "object" ||
        (reserved.data as { allowed?: unknown }).allowed !== true) {
      const reason = reserved.error
        ? "O bloqueio financeiro do servidor ainda não está disponível. Aplique a migração de orçamento antes de ativar a Luna."
        : ((reserved.data as { reason?: string } | null)?.reason ?? "budget_blocked");
      return { ok: false as const, requestStarted: false, usage: null, error: reason };
    }

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: "gpt-6-luna",
          instructions: data.system,
          input: data.messages,
          max_output_tokens: maxOutputTokens,
          store: false,
        }),
      });
    } catch {
      // A chamada pode ter sido cobrada apesar de uma falha de rede; a reserva expira em 10 min.
      return { ok: false as const, requestStarted: true, usage: null, error: "Falha de rede após iniciar a chamada; o valor máximo ficou reservado temporariamente." };
    }

    const payload = await response.json().catch(() => null) as unknown;
    const usage = readUsage(payload && typeof payload === "object" ? (payload as { usage?: unknown }).usage : null);
    if (!usage) {
      // Sem usage não há reconciliação segura. A reserva fica ativa até expirar.
      return {
        ok: false as const,
        requestStarted: true,
        usage: null,
        error: response.ok
          ? "A API não informou o consumo; a reserva ficará protegida temporariamente."
          : `OpenAI respondeu HTTP ${response.status} sem informar usage; a reserva ficará protegida temporariamente.`,
      };
    }

    const settled = await db.rpc("lia_settle_ai_budget", {
      p_reservation_id: reservationId,
      p_input_tokens: usage.inputTokens,
      p_cached_input_tokens: usage.cachedInputTokens,
      p_output_tokens: usage.outputTokens,
    });
    if (settled.error || settled.data !== true) {
      return { ok: false as const, requestStarted: true, usage, error: "Não consegui reconciliar o consumo no orçamento do servidor. A resposta foi bloqueada por segurança." };
    }

    if (!response.ok) {
      return { ok: false as const, requestStarted: true, usage, error: `OpenAI respondeu HTTP ${response.status}.` };
    }
    const text = readOutput(payload);
    if (!text) return { ok: false as const, requestStarted: true, usage, error: "A API respondeu sem texto de saída." };
    return { ok: true as const, requestStarted: true, text, usage };
  });
