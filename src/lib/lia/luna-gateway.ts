/**
 * Adaptador cliente do Provider Gateway.
 * Autoriza o custo antes da chamada e reconcilia usage ou reserva conservadora.
 */
import {
  authorizePaidCall,
  releasePaidCall,
  settleEstimatedPaidCall,
  settlePaidCall,
} from "./cost-guard";
import { callLunaGateway } from "./luna-gateway.functions";

export type LunaMessage = { role: "user" | "assistant"; content: string };

export type LunaReply =
  | { ok: true; text: string; usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } }
  | { ok: false; reason: string };

const MODEL = "gpt-6-luna";
const MAX_OUTPUT_TOKENS = 768;

/** Estimativa deliberadamente conservadora; sem tokenizer, não aplica desconto de cache. */
export function estimateInputTokens(system: string, messages: LunaMessage[]): number {
  const chars = system.length + messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.max(256, Math.ceil(chars * 0.625) + 256);
}

export async function requestLunaReply(
  system: string,
  messages: LunaMessage[],
  options: { maxOutputTokens?: number; task?: string } = {},
): Promise<LunaReply> {
  const maxOutputTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(64, Math.floor(options.maxOutputTokens ?? MAX_OUTPUT_TOKENS)),
  );
  const maxInputTokens = estimateInputTokens(system, messages);
  const authorization = authorizePaidCall({
    provider: "openai",
    model: MODEL,
    tier: "standard",
    maxInputTokens,
    maxOutputTokens,
    task: options.task ?? "chat",
  });

  if (!authorization.allowed) {
    return { ok: false, reason: `Chamada remota bloqueada pelo Cost Guard: ${authorization.reason}.` };
  }

  const reservationId = authorization.reservation.id;
  try {
    const result = await callLunaGateway({
      data: { system, messages, maxOutputTokens },
    });

    if (!result.requestStarted) {
      releasePaidCall(reservationId);
      return { ok: false, reason: result.error };
    }

    const settled = result.usage
      ? settlePaidCall({
          reservationId,
          inputTokens: result.usage.inputTokens,
          cachedInputTokens: result.usage.cachedInputTokens,
          outputTokens: result.usage.outputTokens,
        })
      : settleEstimatedPaidCall({
          reservationId,
          inputTokens: maxInputTokens,
          outputTokens: maxOutputTokens,
        });
    if (!settled) {
      return { ok: false, reason: "A chamada foi concluída, mas não consegui gravar o consumo local. Não faça novas chamadas remotas até conferir o painel de custos." };
    }

    if (!result.ok) return { ok: false, reason: result.error };
    return {
      ok: true,
      text: result.text,
      usage: result.usage ?? {
        inputTokens: maxInputTokens,
        cachedInputTokens: 0,
        outputTokens: maxOutputTokens,
      },
    };
  } catch {
    // Falhas de autenticação/transporte podem ocorrer depois de a requisição ser enviada.
    // Mantém a reserva até expirar, em vez de liberar orçamento possivelmente consumido.
    return { ok: false, reason: "Não consegui concluir a chamada remota. A reserva ficará protegida temporariamente por segurança." };
  }
}
