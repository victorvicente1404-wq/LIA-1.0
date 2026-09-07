/**
 * Fallback de geração: Google Gemini (API oficial) + busca simples.
 * Somente servidor. A chave vive em GEMINI_API_KEY e nunca vai ao navegador.
 * Não toca em memória, histórico, prompt ou banco — apenas gera texto.
 */

type Part = Record<string, unknown>;
export type GenMessage = { role: "user" | "assistant"; content: string | Part[] };

const GEMINI_MODEL = "gemini-2.5-flash";

function dataUrlToInline(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1]!, data: match[2]! };
}

/** Converte as mensagens do formato do AI SDK para o formato de `contents` do Gemini. */
function toGeminiContents(messages: GenMessage[]) {
  return messages.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") return { role, parts: [{ text: m.content }] };

    const parts: Part[] = [];
    for (const p of m.content) {
      const type = p["type"];
      if (type === "text" && typeof p["text"] === "string") {
        parts.push({ text: p["text"] });
      } else if (type === "image" && typeof p["image"] === "string") {
        const inline = dataUrlToInline(p["image"]);
        if (inline) parts.push({ inlineData: inline });
      } else if (type === "file" && typeof p["data"] === "string") {
        const inline = dataUrlToInline(p["data"] as string);
        if (inline) parts.push({ inlineData: inline });
      }
    }
    if (!parts.length) parts.push({ text: "" });
    return { role, parts };
  });
}

/** Gera resposta com o Gemini oficial. Lança em caso de falha. */
export async function generateWithGemini(system: string, messages: GenMessage[]): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: toGeminiContents(messages),
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini retornou resposta vazia");
  return text;
}

/** Último recurso: busca pública sem chave, para não deixar o usuário sem nada. */
export async function searchFallback(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(q)}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    const abstract = json.AbstractText?.trim();
    if (abstract) {
      const fonte = json.AbstractURL ? `\n\nFonte: ${json.AbstractURL}` : "";
      return `Meus modelos de linguagem estão fora do ar agora, então fui buscar direto na web:\n\n${abstract}${fonte}`;
    }
    const topics = (json.RelatedTopics ?? [])
      .filter((t) => t.Text)
      .slice(0, 3)
      .map((t) => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
    if (topics.length) {
      return `Meus modelos de linguagem estão fora do ar agora, mas encontrei isto na web:\n\n${topics.join("\n")}`;
    }
    return null;
  } catch {
    return null;
  }
}
