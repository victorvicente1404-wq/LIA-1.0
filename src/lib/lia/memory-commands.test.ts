import { describe, expect, it } from "vitest";
import type { MemoryItem } from "./types";
import { findExactMemoryQuery, findMemoryByExactKey, normalizeMemoryKey, parseMemoryWriteCommand, upsertMemory } from "./memory-commands";

const existing: MemoryItem[] = [{ id: "old", kind: "conhecimento", key: "teste_lia", value: "valor", createdAt: 1, source: "usuario" }];

describe("memory commands", () => {
  it("parses explicit key=value save requests", () => {
    expect(parseMemoryWriteCommand("Guarde na memória, teste_lia = memória atualizada")).toMatchObject({ key: "teste_lia", value: "memória atualizada" });
  });
  it("accepts memory without accent in explicit commands", () => {
    expect(parseMemoryWriteCommand("Guarde na memoria, teste_lia = atualizado")).toMatchObject({ key: "teste_lia", value: "atualizado" });
  });
  it("parses natural remember requests", () => {
    expect(parseMemoryWriteCommand("Lembre que a cor do cubo era azul")).toMatchObject({ key: "a cor do cubo", value: "azul" });
  });
  it("does not turn ordinary questions into save commands", () => {
    expect(parseMemoryWriteCommand("Quais são os dez primeiros números de pi?")).toBeNull();
  });
  it("recognizes exact-key questions only", () => {
    expect(findExactMemoryQuery("Qual é o valor de teste_lia?")).toBe("teste_lia");
    expect(findExactMemoryQuery("Qual é a informação registrada em teste_lia?")).toBe("teste_lia");
    expect(findExactMemoryQuery("Quais são os dez primeiros números de pi?")).toBeNull();
  });
  it("matches keys ignoring accents, case and separators", () => {
    expect(normalizeMemoryKey("Teste_Lia")).toBe(normalizeMemoryKey("teste lia"));
    expect(findMemoryByExactKey("TESTE-LIA", existing)?.value).toBe("valor");
  });
  it("updates a key instead of creating duplicates", () => {
    const result = upsertMemory(existing, { key: "TESTE-LIA", value: "memória atualizada", kind: "conhecimento" }, () => "new", 2);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "old", key: "teste_lia", value: "memória atualizada", source: "usuario" });
  });
});
