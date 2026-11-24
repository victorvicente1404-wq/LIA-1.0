/**
 * Cost Guard da Lia — controle local antes de habilitar provedores pagos.
 *
 * Este módulo não faz chamadas de rede e não guarda chaves. Ele mantém
 * orçamento, reservas e lançamentos no armazenamento local do navegador.
 * A integração com o gateway remoto deve chamar authorizePaidCall ANTES
 * de enviar a requisição e settlePaidCall ao receber usage do provedor.
 */

export type PaidTier = "standard" | "flex" | "batch";

export interface TokenRates {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
}

export interface CostGuardConfig {
  monthlyBudgetBRL: number;
  annualBudgetBRL: number;
  reserveBRL: number;
  usdToBrl: number;
  enabled: boolean;
  rates: Record<PaidTier, TokenRates>;
}

export interface UsageEntry {
  id: string;
  at: number;
  provider: string;
  model: string;
  tier: PaidTier;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costBRL: number;
  costUSD: number;
  source: "provider" | "estimate";
  task?: string;
}

export interface PendingReservation {
  id: string;
  createdAt: number;
  expiresAt: number;
  provider: string;
  model: string;
  tier: PaidTier;
  estimatedCostBRL: number;
  task?: string;
}

export interface CostGuardState {
  version: 1;
  config: CostGuardConfig;
  entries: UsageEntry[];
  pending: PendingReservation[];
}

export interface CostSummary {
  monthSpentBRL: number;
  yearSpentBRL: number;
  pendingBRL: number;
  monthAvailableBRL: number;
  reserveBRL: number;
  annualAvailableBRL: number;
  monthEntryCount: number;
}

export type AuthorizationResult =
  | { allowed: true; reservation: PendingReservation; summary: CostSummary }
  | { allowed: false; reason: "disabled" | "monthly_limit" | "annual_limit" | "invalid_estimate"; summary: CostSummary };

export const COST_GUARD_STORAGE_KEY = "lia.costGuard.v1";

export const DEFAULT_COST_GUARD_CONFIG: CostGuardConfig = {
  monthlyBudgetBRL: 15,
  annualBudgetBRL: 180,
  reserveBRL: 2,
  usdToBrl: 5.94,
  enabled: true,
  rates: {
    standard: { inputPerMillion: 0.10, cachedInputPerMillion: 0.01, outputPerMillion: 0.50 },
    flex: { inputPerMillion: 0.05, cachedInputPerMillion: 0.005, outputPerMillion: 0.25 },
    batch: { inputPerMillion: 0.05, cachedInputPerMillion: 0.005, outputPerMillion: 0.25 },
  },
};

const RESERVATION_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 10_000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeConfig(input: Partial<CostGuardConfig> | undefined): CostGuardConfig {
  const raw = input ?? {};
  const rawRates = raw.rates ?? {};
  const normalizeTier = (tier: PaidTier): TokenRates => {
    const rate = rawRates[tier] ?? DEFAULT_COST_GUARD_CONFIG.rates[tier];
    return {
      inputPerMillion: validNumber(rate.inputPerMillion, DEFAULT_COST_GUARD_CONFIG.rates[tier].inputPerMillion),
      cachedInputPerMillion: validNumber(rate.cachedInputPerMillion, DEFAULT_COST_GUARD_CONFIG.rates[tier].cachedInputPerMillion),
      outputPerMillion: validNumber(rate.outputPerMillion, DEFAULT_COST_GUARD_CONFIG.rates[tier].outputPerMillion),
    };
  };
  return {
    monthlyBudgetBRL: validNumber(raw.monthlyBudgetBRL, 15),
    annualBudgetBRL: validNumber(raw.annualBudgetBRL, 180),
    reserveBRL: validNumber(raw.reserveBRL, 2),
    usdToBrl: validNumber(raw.usdToBrl, 5.94),
    enabled: raw.enabled !== false,
    rates: {
      standard: normalizeTier("standard"),
      flex: normalizeTier("flex"),
      batch: normalizeTier("batch"),
    },
  };
}

function emptyState(): CostGuardState {
  return {
    version: 1,
    config: { ...DEFAULT_COST_GUARD_CONFIG, rates: { ...DEFAULT_COST_GUARD_CONFIG.rates } },
    entries: [],
    pending: [],
  };
}

function cleanExpiredReservations(state: CostGuardState, now: number): CostGuardState {
  return { ...state, pending: state.pending.filter((item) => item.expiresAt > now) };
}

export function readCostGuard(storage: StorageLike | null = getBrowserStorage(), now = Date.now()): CostGuardState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(COST_GUARD_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<CostGuardState>;
    const config = normalizeConfig(parsed.config);
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter((entry): entry is UsageEntry =>
          Boolean(entry && typeof entry.id === "string" && Number.isFinite(entry.at) &&
            Number.isFinite(entry.costBRL) && entry.costBRL >= 0))
      : [];
    const pending = Array.isArray(parsed.pending)
      ? parsed.pending.filter((item): item is PendingReservation =>
          Boolean(item && typeof item.id === "string" && Number.isFinite(item.expiresAt) &&
            Number.isFinite(item.estimatedCostBRL) && item.estimatedCostBRL >= 0))
      : [];
    return cleanExpiredReservations({ version: 1, config, entries, pending }, now);
  } catch {
    return emptyState();
  }
}

export function writeCostGuard(state: CostGuardState, storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(COST_GUARD_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function estimateCostBRL(args: {
  tier: PaidTier;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  config?: CostGuardConfig;
}): number {
  const config = normalizeConfig(args.config);
  const input = Math.max(0, Math.floor(args.inputTokens));
  const cached = Math.min(input, Math.max(0, Math.floor(args.cachedInputTokens ?? 0)));
  const output = Math.max(0, Math.floor(args.outputTokens));
  const rates = config.rates[args.tier];
  const uncached = input - cached;
  const usd = (
    uncached * rates.inputPerMillion +
    cached * rates.cachedInputPerMillion +
    output * rates.outputPerMillion
  ) / 1_000_000;
  return usd * config.usdToBrl;
}

function periodStart(now: number, annual: boolean): number {
  const date = new Date(now);
  return annual
    ? new Date(date.getFullYear(), 0, 1).getTime()
    : new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function summarizeCostGuard(state: CostGuardState, now = Date.now()): CostSummary {
  const monthStart = periodStart(now, false);
  const yearStart = periodStart(now, true);
  const monthSpentBRL = state.entries.filter((e) => e.at >= monthStart && e.at <= now).reduce((sum, e) => sum + e.costBRL, 0);
  const yearSpentBRL = state.entries.filter((e) => e.at >= yearStart && e.at <= now).reduce((sum, e) => sum + e.costBRL, 0);
  const pendingBRL = state.pending.reduce((sum, p) => sum + p.estimatedCostBRL, 0);
  const normalMonthlyCap = Math.max(0, state.config.monthlyBudgetBRL - state.config.reserveBRL);
  return {
    monthSpentBRL,
    yearSpentBRL,
    pendingBRL,
    monthAvailableBRL: Math.max(0, normalMonthlyCap - monthSpentBRL - pendingBRL),
    reserveBRL: state.config.reserveBRL,
    annualAvailableBRL: Math.max(0, state.config.annualBudgetBRL - yearSpentBRL - pendingBRL),
    monthEntryCount: state.entries.filter((e) => e.at >= monthStart && e.at <= now).length,
  };
}

function createId(): string {
  return `cg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function authorizePaidCall(args: {
  provider: string;
  model: string;
  tier: PaidTier;
  maxInputTokens: number;
  maxOutputTokens: number;
  cachedInputTokens?: number;
  task?: string;
  now?: number;
  storage?: StorageLike | null;
}): AuthorizationResult {
  const now = args.now ?? Date.now();
  const storage = args.storage === undefined ? getBrowserStorage() : args.storage;
  const state = cleanExpiredReservations(readCostGuard(storage, now), now);
  const summary = summarizeCostGuard(state, now);
  const estimate = estimateCostBRL({
    tier: args.tier,
    inputTokens: args.maxInputTokens,
    cachedInputTokens: args.cachedInputTokens,
    outputTokens: args.maxOutputTokens,
    config: state.config,
  });
  if (!Number.isFinite(estimate) || estimate < 0) return { allowed: false, reason: "invalid_estimate", summary };
  if (!state.config.enabled) return { allowed: false, reason: "disabled", summary };
  if (estimate > summary.monthAvailableBRL + 1e-9) return { allowed: false, reason: "monthly_limit", summary };
  if (estimate > summary.annualAvailableBRL + 1e-9) return { allowed: false, reason: "annual_limit", summary };

  const reservation: PendingReservation = {
    id: createId(),
    createdAt: now,
    expiresAt: now + RESERVATION_TTL_MS,
    provider: args.provider,
    model: args.model,
    tier: args.tier,
    estimatedCostBRL: estimate,
    ...(args.task ? { task: args.task.slice(0, 80) } : {}),
  };
  const next = { ...state, pending: [...state.pending, reservation] };
  if (!writeCostGuard(next, storage)) {
    return { allowed: false, reason: "disabled", summary };
  }
  return { allowed: true, reservation, summary: summarizeCostGuard(next, now) };
}

export function settlePaidCall(args: {
  reservationId: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  now?: number;
  storage?: StorageLike | null;
}): UsageEntry | null {
  const now = args.now ?? Date.now();
  const storage = args.storage === undefined ? getBrowserStorage() : args.storage;
  const state = readCostGuard(storage, now);
  const reservation = state.pending.find((item) => item.id === args.reservationId);
  if (!reservation) return null;
  const inputTokens = Math.max(0, Math.floor(args.inputTokens));
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, Math.floor(args.cachedInputTokens ?? 0)));
  const outputTokens = Math.max(0, Math.floor(args.outputTokens));
  const costBRL = estimateCostBRL({
    tier: reservation.tier,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    config: state.config,
  });
  const entry: UsageEntry = {
    id: reservation.id,
    at: now,
    provider: reservation.provider,
    model: reservation.model,
    tier: reservation.tier,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costBRL,
    costUSD: state.config.usdToBrl > 0 ? costBRL / state.config.usdToBrl : 0,
    source: "provider",
    ...(reservation.task ? { task: reservation.task } : {}),
  };
  const next: CostGuardState = {
    ...state,
    pending: state.pending.filter((item) => item.id !== reservation.id),
    entries: [...state.entries, entry].slice(-MAX_ENTRIES),
  };
  return writeCostGuard(next, storage) ? entry : null;
}

/** Registra custo aproximado quando o provedor não retorna usage. */
export function settleEstimatedPaidCall(args: {
  reservationId: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  now?: number;
  storage?: StorageLike | null;
}): UsageEntry | null {
  const entry = settlePaidCall(args);
  if (!entry) return null;
  const storage = args.storage === undefined ? getBrowserStorage() : args.storage;
  const state = readCostGuard(storage, args.now ?? Date.now());
  const next = { ...state, entries: state.entries.map((item) => item.id === entry.id ? { ...item, source: "estimate" as const } : item) };
  return writeCostGuard(next, storage) ? { ...entry, source: "estimate" } : null;
}

export function releasePaidCall(reservationId: string, storage: StorageLike | null = getBrowserStorage()): boolean {
  const state = readCostGuard(storage);
  return writeCostGuard({ ...state, pending: state.pending.filter((item) => item.id !== reservationId) }, storage);
}

export function updateCostGuardConfig(
  patch: Partial<Omit<CostGuardConfig, "rates">> & { rates?: Partial<Record<PaidTier, TokenRates>> },
  storage: StorageLike | null = getBrowserStorage(),
): CostGuardState {
  const current = readCostGuard(storage);
  const config = normalizeConfig({
    ...current.config,
    ...patch,
    rates: {
      ...current.config.rates,
      ...(patch.rates ?? {}),
    },
  });
  const next = { ...current, config };
  writeCostGuard(next, storage);
  return next;
}

export function resetCostGuard(storage: StorageLike | null = getBrowserStorage()): boolean {
  return writeCostGuard(emptyState(), storage);
}
