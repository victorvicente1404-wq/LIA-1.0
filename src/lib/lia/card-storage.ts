/**
 * Lia Card — camada de armazenamento portátil.
 *
 * O cartão é um volume local namespaced. Toda leitura passa por normalização
 * para manter compatibilidade com cartões antigos e dados parcialmente preenchidos.
 */
import { createCardData, defaultModules, defaultProfiles } from "./defaults";
import type { LiaCardData, MemoryItem, Profile } from "./types";

const VOLUME_KEY = "lia.card.volume";
const MOUNT_KEY = "lia.card.mounted";
const isBrowser = () => typeof window !== "undefined";

const MEMORY_KINDS = new Set<MemoryItem["kind"]>([
  "perfil", "preferencia", "conhecimento", "rotina", "relacionamento", "importante",
]);

function normalizeMemory(value: unknown, index: number): MemoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<MemoryItem>;
  if (typeof item.key !== "string" || !item.key.trim() || typeof item.value !== "string" || !item.value.trim()) return null;
  const kind = MEMORY_KINDS.has(item.kind as MemoryItem["kind"]) ? item.kind as MemoryItem["kind"] : "conhecimento";
  return {
    id: typeof item.id === "string" && item.id ? item.id : `legacy-memory-${index}-${item.key.trim().toLowerCase()}`,
    kind,
    key: item.key.trim(),
    value: item.value.trim(),
    createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now(),
    source: item.source === "lia" ? "lia" : "usuario",
  };
}

/** Completa campos ausentes sem descartar memórias ou configurações existentes. */
export function normalizeCardData(input: unknown): LiaCardData {
  const raw = input && typeof input === "object" ? input as Partial<LiaCardData> : {};
  const defaults = createCardData();
  const incomingProfiles = Array.isArray(raw.profiles) ? raw.profiles : [];
  const profiles: Profile[] = incomingProfiles.map((value, profileIndex) => {
    const p = value && typeof value === "object" ? value as Partial<Profile> : {};
    const base = defaultProfiles.find((candidate) => candidate.id === p.id || candidate.nome === p.nome) ?? defaultProfiles[0]!;
    const memories = Array.isArray(p.memory)
      ? p.memory.map(normalizeMemory).filter((item): item is MemoryItem => item !== null)
      : [];
    return {
      ...base,
      ...p,
      id: typeof p.id === "string" && p.id ? p.id : `legacy-profile-${profileIndex}`,
      nome: typeof p.nome === "string" && p.nome ? p.nome : base.nome,
      descricao: typeof p.descricao === "string" ? p.descricao : base.descricao,
      personality: { ...base.personality, ...(p.personality ?? {}) },
      modules: { ...base.modules, ...(p.modules ?? {}) },
      memory: memories,
      voz: { ...base.voz, ...(p.voz ?? {}) },
      iniciativa: Number.isFinite(p.iniciativa) ? Number(p.iniciativa) : base.iniciativa,
    } as Profile;
  });
  const safeProfiles = profiles.length ? profiles : defaultProfiles;
  const requestedActiveId = raw.activeProfileId;
  const activeProfileId = safeProfiles.some((p) => p.id === requestedActiveId)
    ? requestedActiveId!
    : safeProfiles[0]!.id;
  const user = raw.user && typeof raw.user === "object" ? raw.user : defaults.user;
  return {
    ...defaults,
    ...raw,
    cardId: typeof raw.cardId === "string" && raw.cardId ? raw.cardId : defaults.cardId,
    cardName: typeof raw.cardName === "string" && raw.cardName ? raw.cardName : defaults.cardName,
    user: {
      nome: typeof user.nome === "string" ? user.nome : "",
      pronome: typeof user.pronome === "string" ? user.pronome : "",
      notas: typeof user.notas === "string" ? user.notas : "",
    },
    profiles: safeProfiles,
    activeProfileId,
    modules: defaultModules.map((base) => ({
      ...base,
      ...(Array.isArray(raw.modules) ? raw.modules.find((m) => m?.id === base.id) : undefined),
    })),
    history: Array.isArray(raw.history) ? raw.history : [],
    settings: { ...defaults.settings, ...(raw.settings ?? {}) },
    version: Number.isFinite(raw.version) ? Number(raw.version) : defaults.version,
    createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : defaults.createdAt,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : defaults.updatedAt,
  } as LiaCardData;
}

export function cardExists(): boolean {
  return isBrowser() && window.localStorage.getItem(VOLUME_KEY) !== null;
}

export function isMounted(): boolean {
  return isBrowser() && window.localStorage.getItem(MOUNT_KEY) === "1";
}

export function readCard(): LiaCardData | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (!raw) return null;
  try {
    return normalizeCardData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCard(data: LiaCardData): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(VOLUME_KEY, JSON.stringify({ ...normalizeCardData(data), updatedAt: Date.now() }));
}

/** Cria (formata) um novo Lia Card. */
export function formatCard(cardName?: string): LiaCardData {
  const data = createCardData(cardName);
  writeCard(data);
  mount();
  return data;
}

export function mount(): void {
  if (isBrowser()) window.localStorage.setItem(MOUNT_KEY, "1");
}

/** Remoção segura: a aplicação continua funcionando, sem os dados portáteis. */
export function eject(): void {
  if (isBrowser()) window.localStorage.setItem(MOUNT_KEY, "0");
}

export function destroyCard(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(VOLUME_KEY);
  window.localStorage.removeItem(MOUNT_KEY);
}

export function exportCard(): string {
  return JSON.stringify(readCard(), null, 2);
}

export function importCard(json: string): LiaCardData {
  const data = normalizeCardData(JSON.parse(json));
  writeCard(data);
  mount();
  return data;
}
