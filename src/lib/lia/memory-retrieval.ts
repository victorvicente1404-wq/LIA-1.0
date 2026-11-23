import type { MemoryItem } from "./types";

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "da", "das", "do", "dos", "em", "no", "na", "nos", "nas",
  "para", "por", "com", "sem", "e", "ou", "que", "qual", "quais",
  "quem", "como", "quando", "onde", "porque", "por que", "se",
  "eu", "voce", "voces", "me", "minha", "meu", "minhas", "meus",
  "ele", "ela", "isso", "isto", "aquele", "aquela", "aquilo",
  "era", "foi", "ser", "estar", "esta", "estava", "tem", "tinha",
  "lembra", "lembro", "lembrar", "lembrou", "sobre", "aquela",
  "informacao", "dado", "coisa", "coisas", "numero",
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function tokens(value: string): string[] {
  return normalize(value)
    .match(/[a-z0-9]+/g)
    ?.map((token) => {
      if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
      if (token.endsWith("es") && token.length > 5) return token.slice(0, -2);
      return token;
    })
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)) ?? [];
}

/**
 * Recuperação lexical contextual, totalmente local e sem palavras-gatilho.
 * A pontuação favorece termos presentes na chave da memória e reduz termos
 * comuns em muitos registros. O modelo recebe apenas os melhores candidatos.
 */
export function retrieveRelevantMemories(
  query: string,
  memories: MemoryItem[],
  limit = 10,
): MemoryItem[] {
  if (!query.trim() || !memories.length || limit <= 0) return [];

  const queryTerms = [...new Set(tokens(query))];
  if (!queryTerms.length) return [];

  const documents = memories.map((memory) => ({
    memory,
    keyTerms: new Set(tokens(memory.key)),
    valueTerms: new Set(tokens(memory.value)),
  }));

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      documents.filter((doc) => doc.keyTerms.has(term) || doc.valueTerms.has(term)).length,
    );
  }

  const scored = documents.map((doc) => {
    let score = 0;
    let matchedTerms = 0;
    for (const term of queryTerms) {
      const frequency = documentFrequency.get(term) ?? 0;
      if (!frequency) continue;
      const weight = 1 + Math.log((memories.length + 1) / (frequency + 1));
      const inKey = doc.keyTerms.has(term);
      const inValue = doc.valueTerms.has(term);
      if (inKey || inValue) matchedTerms += 1;
      if (inKey) score += 4 * weight;
      if (inValue) score += 2 * weight;
    }

    // Pequeno desempate por recência, sem deixar memórias novas vencerem relevância.
    const ageDays = Math.max(0, (Date.now() - doc.memory.createdAt) / 86_400_000);
    score += Math.max(0, 0.15 - ageDays * 0.001);
    return { memory: doc.memory, score, matchedTerms };
  });

  return scored
    .filter((item) => item.matchedTerms > 0 && item.score >= 1.25)
    .sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt)
    .slice(0, limit)
    .map((item) => item.memory);
}
