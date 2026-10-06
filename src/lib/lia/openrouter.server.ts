/**
 * Fallback de geração: OpenRouter com modelos gratuitos.
 * Somente servidor. A chave vive em OPENROUTER_API_KEY e nunca vai ao navegador.
 * Não toca em memória, histórico, prompt ou banco — apenas gera texto.
 */

type Part = Record<string, unknown>;
export type OrMessage = { role: "user" | "assistant"; content: string | Part[] };

/** Modelos gratuitos do OpenRouter, tentados em ordem. */
const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "deepseek/deepseek-r1:free",
  "qwen/qwen3-235b-a22b:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

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

/** Gera resposta via OpenRouter, varrendo os modelos gratuitos. Lança se todos falharem. */
export async function generateWithOpenRouter(system: string, messages: OrMessage[]): Promise<string> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY ausente");

  const payload = toOpenAiMessages(system, messages);
  let lastError = "sem detalhe";

  for (const model of FREE_MODELS) {
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
  throw new Error(`OpenRouter falhou em todos os modelos gratuitos (${lastError})`);
}
