import { describe, expect, it } from "vitest";
import { driftBond, evolveBond, rewardBond } from "./rewards";

describe("vínculo dinâmico", () => {
  it("petiscos nunca levam acima de 100", () => {
    let b = { humor: 99, confianca: 99, intimidade: 99, petiscos: 0 };
    for (let i = 0; i < 50; i++) b = rewardBond(b, i % 2 ? "uva" : "morango");
    expect(b.humor).toBeLessThanOrEqual(100);
  });
  it("ofensas baixam o humor", () => {
    const b = evolveBond({ humor: 70, confianca: 60, intimidade: 50, petiscos: 0, atualizadoEm: Date.now() }, "você é inútil e burra");
    expect(b.humor).toBeLessThan(70);
  });
  it("com o tempo o humor 100 volta para perto da base", () => {
    const now = Date.now();
    const b = driftBond({ humor: 100, confianca: 50, intimidade: 40, petiscos: 0, atualizadoEm: now - 72 * 3_600_000 }, now);
    expect(b.humor).toBeLessThan(85);
  });
});
