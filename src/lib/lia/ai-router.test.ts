import { describe, expect, it } from "vitest";
import { isComplexLunaTask } from "./ai-router";

describe("Lia AI router", () => {
  it("keeps short everyday messages out of the complex route", () => {
    expect(isComplexLunaTask("Oi, tudo bem?")).toBe(false);
  });

  it("recognizes technical implementation requests", () => {
    expect(isComplexLunaTask("Implemente a arquitetura do roteador de IA")).toBe(true);
  });

  it("recognizes longer requests as complex", () => {
    expect(isComplexLunaTask("x".repeat(1_600))).toBe(true);
  });
});
