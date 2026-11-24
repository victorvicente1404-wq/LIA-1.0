/**
 * Provider Gateway da Lia — GPT-6 Luna via Responses API.
 * Somente servidor: OPENAI_API_KEY nunca é enviada ao navegador.
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

type Usage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

function readUsage(value: unknown): Usage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
  };
  if (
    typeof usage.input_tokens !== "number" ||
    typeof usage.output_tokens !== "number" ||
    !Number.isFinite(usage.input_tokens) ||
    !Number.isFinite(usage.output_tokens)
  ) return null;
  const cached = usage.input_tokens_details?.cached_tokens;
  return {
    inputTokens: Math.max(0, Math.floor(usage.input_tokens)),
    cachedInputTokens: typeof cached === "number" && Number.isFinite(cached)
      ? Math.max(0, Math.floor(cached))
      : 0,
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
  .handler(async ({ data }) => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, requestStarted: false, error: "OPENAI_API_KEY não configurada no servidor." };
    }

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: "gpt-6-luna",
          instructions: data.system,
          input: data.messages,
          max_output_tokens: data.maxOutputTokens,
          store: false,
        }),
      });
    } catch {
      // A requisição pode ter chegado ao provedor antes da falha de rede.
      return { ok: false as const, requestStarted: true, usage: null, error: "Falha de rede após iniciar a chamada; consumo estimado pelo limite reservado." };
    }

    const payload = await response.json().catch(() => null) as unknown;
    const usage = readUsage(
      payload && typeof payload === "object" ? (payload as { usage?: unknown }).usage : null,
    );
    if (!response.ok) {
      return {
        ok: false as const,
        requestStarted: true,
        usage,
        error: `OpenAI respondeu HTTP ${response.status}.`,
      };
    }

    const text = readOutput(payload);
    if (!text) {
      return {
        ok: false as const,
        requestStarted: true,
        usage,
        error: "A API respondeu sem texto de saída.",
      };
    }
    return { ok: true as const, requestStarted: true, text, usage };
  });
