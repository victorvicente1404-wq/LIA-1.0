import { describe, expect, it } from "vitest";
import {
  authorizePaidCall,
  estimateCostBRL,
  readCostGuard,
  releasePaidCall,
  settlePaidCall,
  summarizeCostGuard,
  updateCostGuardConfig,
} from "./cost-guard";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

describe("Lia Cost Guard", () => {
  it("calcula Standard, Flex e Batch com os preços configurados", () => {
    expect(estimateCostBRL({ tier: "standard", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(3.564);
    expect(estimateCostBRL({ tier: "flex", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(1.782);
    expect(estimateCostBRL({ tier: "batch", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(1.782);
  });

  it("considera cache de entrada com tarifa reduzida", () => {
    const full = estimateCostBRL({ tier: "standard", inputTokens: 1_000_000, outputTokens: 0 });
    const cached = estimateCostBRL({ tier: "standard", inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 });
    expect(full).toBeCloseTo(0.594);
    expect(cached).toBeCloseTo(0.0594);
  });

  it("reserva o custo estimado antes de autorizar a chamada", () => {
    const storage = memoryStorage();
    const result = authorizePaidCall({
      provider: "openai",
      model: "gpt-6-luna",
      tier: "standard",
      maxInputTokens: 10_000,
      maxOutputTokens: 2_000,
      now: new Date(2026, 10, 24).getTime(),
      storage,
    });
    expect(result.allowed).toBe(true);
    expect(readCostGuard(storage).pending).toHaveLength(1);
  });

  it("bloqueia uma chamada que invadiria a reserva mensal", () => {
    const storage = memoryStorage();
    const result = authorizePaidCall({
      provider: "openai",
      model: "gpt-6-luna",
      tier: "standard",
      maxInputTokens: 100_000_000,
      maxOutputTokens: 0,
      now: new Date(2026, 10, 24).getTime(),
      storage,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("monthly_limit");
  });

  it("reconcilia o uso real e libera a reserva", () => {
    const storage = memoryStorage();
    const now = new Date(2026, 10, 24).getTime();
    const authorized = authorizePaidCall({
      provider: "openai",
      model: "gpt-6-luna",
      tier: "standard",
      maxInputTokens: 20_000,
      maxOutputTokens: 4_000,
      now,
      storage,
    });
    expect(authorized.allowed).toBe(true);
    if (!authorized.allowed) return;
    const entry = settlePaidCall({
      reservationId: authorized.reservation.id,
      inputTokens: 5_000,
      outputTokens: 1_000,
      now: now + 1_000,
      storage,
    });
    expect(entry?.source).toBe("provider");
    expect(readCostGuard(storage).pending).toHaveLength(0);
    expect(readCostGuard(storage).entries).toHaveLength(1);
  });

  it("permite liberar reserva quando a chamada falha", () => {
    const storage = memoryStorage();
    const authorized = authorizePaidCall({
      provider: "openai",
      model: "gpt-6-luna",
      tier: "standard",
      maxInputTokens: 10_000,
      maxOutputTokens: 1_000,
      storage,
    });
    expect(authorized.allowed).toBe(true);
    if (!authorized.allowed) return;
    expect(releasePaidCall(authorized.reservation.id, storage)).toBe(true);
    expect(readCostGuard(storage).pending).toHaveLength(0);
  });

  it("mantém a reserva protegida e calcula os saldos", () => {
    const storage = memoryStorage();
    const state = updateCostGuardConfig({ monthlyBudgetBRL: 15, reserveBRL: 2, annualBudgetBRL: 180 }, storage);
    const summary = summarizeCostGuard(state);
    expect(summary.monthAvailableBRL).toBe(13);
    expect(summary.reserveBRL).toBe(2);
    expect(summary.annualAvailableBRL).toBe(180);
  });
});
