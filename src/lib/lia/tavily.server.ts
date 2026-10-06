/** Pesquisa na web via Tavily (somente servidor; chave em TAVILY_API_KEY). */
import { tool } from "ai";
import { z } from "zod";

export interface TavilyResult {
  answer?: string;
  results: Array<{ title: string; url: string; content: string }>;
}

export async function tavilySearch(query: string, maxResults = 5, timeoutMs = 10_000): Promise<TavilyResult | null> {
  const key = process.env["TAVILY_API_KEY"];
  const q = query.trim();
  if (!key || !q) return null;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: q.slice(0, 400), max_results: maxResults, include_answer: true, search_depth: "basic" }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = (await res.json()) as TavilyResult;
  return {
    answer: json.answer,
    results: (json.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      content: String(r.content ?? "").slice(0, 1200),
    })),
  };
}

export function buildTavilyTools() {
  if (!process.env["TAVILY_API_KEY"]) return {};
  return {
    pesquisar_web: tool({
      description:
        "Pesquisa na web em tempo real (Tavily). Use quando precisar de informações atuais: notícias, preços, clima, resultados, fatos recentes. Cite as fontes.",
      inputSchema: z.object({ query: z.string().describe("o que pesquisar") }),
      execute: async ({ query }) => {
        try {
          return (await tavilySearch(query)) ?? { results: [] };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
  };
}

/** Resposta de último recurso quando todos os modelos falham. */
export async function tavilyFallback(query: string): Promise<string | null> {
  try {
    const r = await tavilySearch(query, 3);
    if (!r || (!r.answer && !r.results.length)) return null;
    const fontes = r.results.map((x) => `- [${x.title}](${x.url})`).join("\n");
    const corpo = r.answer?.trim() || r.results.map((x) => x.content).join("\n\n").slice(0, 1500);
    return `Meus modelos de linguagem estão fora do ar agora, então fui buscar direto na web:\n\n${corpo}${fontes ? `\n\nFontes:\n${fontes}` : ""}`;
  } catch {
    return null;
  }
}
