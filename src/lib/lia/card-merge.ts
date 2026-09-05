/**
 * Mesclagem inteligente de um Lia Card exportado com o atual:
 * memórias são acrescentadas (nunca sobrescritas), configurações e perfis
 * sincronizados campo por campo.
 */
import type { LiaCardData, MemoryItem, Profile } from "./types";

const memKey = (m: MemoryItem) => `${m.kind}|${m.key.toLowerCase()}|${m.value.toLowerCase()}`;

function mergeMemories(current: MemoryItem[], incoming: MemoryItem[]): MemoryItem[] {
  const seen = new Set(current.map(memKey));
  const extras = incoming.filter((m) => !seen.has(memKey(m)));
  return [...extras, ...current]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 400);
}

function mergeProfiles(current: Profile[], incoming: Profile[]): Profile[] {
  const out = current.map((p) => {
    const other = incoming.find((i) => i.id === p.id || i.nome === p.nome);
    return other ? { ...p, memory: mergeMemories(p.memory, other.memory ?? []) } : p;
  });
  for (const inc of incoming) {
    if (!out.some((p) => p.id === inc.id || p.nome === inc.nome)) out.push(inc);
  }
  return out;
}

export function mergeCardData(current: LiaCardData, incoming: LiaCardData): LiaCardData {
  return {
    ...current,
    cardName: incoming.cardName || current.cardName,
    user: {
      nome: current.user.nome || incoming.user?.nome || "",
      pronome: current.user.pronome || incoming.user?.pronome || "",
      notas: [current.user.notas, incoming.user?.notas]
        .filter((t) => t && t.trim())
        .filter((t, i, a) => a.indexOf(t) === i)
        .join("\n"),
    },
    profiles: mergeProfiles(current.profiles, incoming.profiles ?? []),
    modules: current.modules.map((m) => {
      const other = incoming.modules?.find((i) => i.id === m.id);
      return other ? { ...m, ativo: m.ativo || other.ativo } : m;
    }),
    settings: { ...current.settings, ...(incoming.settings ?? {}) },
    history: current.history?.length ? current.history : (incoming.history ?? []),
    updatedAt: Date.now(),
  };
}
