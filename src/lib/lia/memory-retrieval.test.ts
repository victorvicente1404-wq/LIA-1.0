import { describe, expect, it } from "vitest";
import { retrieveRelevantMemories } from "./memory-retrieval";
import type { MemoryItem } from "./types";

const memories: MemoryItem[] = [
  { id: "1", kind: "conhecimento", key: "cubo", value: "A cor do cubo era azul.", createdAt: 10, source: "usuario" },
  { id: "2", kind: "preferencia", key: "comida favorita", value: "Pizza.", createdAt: 20, source: "usuario" },
  { id: "3", kind: "conhecimento", key: "numero de pi", value: "3,1415926535", createdAt: 30, source: "usuario" },
];

describe("retrieveRelevantMemories", () => {
  it("recupera uma lembrança com pergunta natural, sem prefixo especial", () => {
    const result = retrieveRelevantMemories("Você lembra qual era a cor do cubo?", memories);
    expect(result.map((item) => item.key)).toContain("cubo");
  });

  it("usa contexto anterior para resolver uma pergunta de acompanhamento", () => {
    const result = retrieveRelevantMemories("A gente falou sobre o cubo. E qual era a cor?", memories);
    expect(result.map((item) => item.key)).toContain("cubo");
  });

  it("não transforma uma pergunta geral sobre pi em busca forçada de memória", () => {
    const result = retrieveRelevantMemories("Quais são os dez primeiros números de pi?", memories);
    expect(result.map((item) => item.key)).not.toContain("numero de pi");
  });

  it("não retorna registros quando não há termos relacionados", () => {
    expect(retrieveRelevantMemories("Como está o clima hoje?", memories)).toEqual([]);
  });
});
