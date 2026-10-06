/**
 * Fallback de geração: OpenRouter com modelos gratuitos.
 * Somente servidor. A chave vive em OPENROUTER_API_KEY e nunca vai ao navegador.
 * Não toca em memória, histórico, prompt ou banco — apenas gera texto.
 *
 * Estratégia: busca a lista viva de modelos ":free" do OpenRouter e tenta
 * todos em ordem (com cache de 10 min). Se a listagem falhar, usa uma lista
 * fixa de modelos conhecidos. Assim a Lia quase nunca fica sem resposta.
 */

type Part = Record<string, unknown>;
export type OrMessage = { role: "user" | "assistant"; content: string | Part[] };

/** Modelos gratuitos conhecidos, usados se a listagem dinâmica falhar. */
const KNOWN_FREE_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3.5-lightning:free",
  "inclusionai/ling-3.0-flash-sante:free",
  "liquid/lfm-2.5-2.6b:free",
  "thinkingmachines/inkling:free",
  "poolside/laguna-s-2.1:free",
  "apodex/apodex-1.1-mini:free",
];

/** Modelos que não servem para conversar (moderação, código puro etc.). */
const BLOCKLIST = /content-safety|guard|moderation|embed|code/i;

let cachedModels: { at: number; ids: string[] } | null = null;

/** Lista viva de modelos gratuitos do OpenRouter (cache de 10 min). */
async function listFreeModels(apiKey: string): Promise<string[]> {
  if (cachedModels && Date.now() - cachedModels.at < 10 * 60_000) return cachedModels.ids;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (json.data ?? [])
      .map((m) => m.id ?? "")
      .filter((id) => id.endsWith(":free") && !BLOCKLIST.test(id));
    if (!ids.length) throw new Error("lista vazia");
    // Modelos conhecidos primeiro (mais confiáveis), depois o resto.
    const ordered = [...KNOWN_FREE_MODELS.filter((k) => ids.includes(k)), ...ids.filter((id) => !KNOWN_FREE_MODELS.includes(id))];
    cachedModels = { at: Date.now(), ids: ordered };
    return ordered;
  } catch {
    return KNOWN_FREE_MODELS;
  }
}

function dataUrlParts(dataUrl: string): { mime: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  return match ? { mime: match[1]!, data: match[2]! } : null;
}

/** Converte as mensagens para o formato OpenAI aceito pelo OpenRouter. */
function toOpenAiMessages(system: string, messages: OrMessage[]) {
  const out: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const parts: Part[] = [];
    for (const p of m.content) {
      const type = p["type"];
      if (type === "text" && typeof p["text"] === "string") {
        parts.push({ type: "text", text: p["text"] });
      } else if (type === "image" && typeof p["image"] === "string") {
        parts.push({ type: "image_url", image_url: { url: p["image"] } });
      } else if (type === "file" && typeof p["data"] === "string") {
        const parsed = dataUrlParts(p["data"]);
        if (parsed?.mime.startsWith("image/")) {
          parts.push({ type: "image_url", image_url: { url: p["data"] } });
        } else {
          parts.push({ type: "text", text: "[Arquivo anexado não suportado por este modelo]" });
        }
      }
    }
    out.push({ role: m.role, content: parts.length ? parts : "" });
  }
  return out;
}

/**
 * Gera resposta via OpenRouter, varrendo TODOS os modelos gratuitos.
 * Lança somente se todos falharem.
 */
export async function generateWithOpenRouter(system: string, messages: OrMessage[]): Promise<string> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY ausente");

  const payload = toOpenAiMessages(system, messages);
  const models = await listFreeModels(apiKey);
  let lastError = "sem detalhe";

  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "http-referer": "https://lia-portable-ai.lovable.app",
          "x-title": "Lia",
        },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ model, messages: payload }),
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue; // modelo indisponível/limite: tenta o próximo
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (text) return text;
      lastError = "resposta vazia";
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`OpenRouter falhou em ${models.length} modelos gratuitos (${lastError})`);
}
