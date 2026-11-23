import type { MemoryItem } from "./types";

export function normalizeMemoryKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "");
}

export interface MemoryWriteCommand {
  key: string;
  value: string;
  kind: MemoryItem["kind"];
}

export function parseMemoryWriteCommand(text: string): MemoryWriteCommand | null {
  const input = text.trim();
  const explicit = input.match(/^(?:por favor[, ]*)?(?:guarde|salve|registre|lembre)(?:\s+(?:na|em)\s+(?:minha|sua)\s+mem[oó]ria)?\s*[:,-]?\s*(.+)$/i);
  if (!explicit) return null;
  const payload = explicit[1].trim();
  const pair = payload.match(/^(?:que\s+)?(.+?)\s*(?:=|:|\s+\b(?:é|era|foi|são|sao|significa)\b\s+)\s*(.+)$/i);
  if (!pair) return null;
  const key = pair[1].trim().replace(/^["']|["']$/g, "").replace(/[?.!]+$/, "");
  const value = pair[2].trim().replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "");
  if (!key || !value || key.length > 100 || value.length > 1000) return null;
  return { key, value, kind: "conhecimento" };
}

export function findExactMemoryQuery(text: string): string | null {
  const input = text.trim();
  const patterns = [
    /\b(?:valor|conte[uú]do)\s+(?:de|do|da)\s+["']?([\p{L}\p{N}_-]+)["']?\s*[?.!]*$/iu,
    /\b(?:informa[cç][aã]o|registro)\s+(?:registrada?\s+)?(?:em|de|do|da)\s+["']?([\p{L}\p{N}_-]+)["']?\s*[?.!]*$/iu,
    /\b(?:o\s+que\s+tem|o\s+que\s+est[aá]\s+guardado)\s+(?:em|na\s+chave)\s+["']?([\p{L}\p{N}_-]+)["']?\s*[?.!]*$/iu,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function findMemoryByExactKey(query: string, memories: MemoryItem[]): MemoryItem | null {
  const normalized = normalizeMemoryKey(query);
  if (!normalized) return null;
  return memories.find((item) => normalizeMemoryKey(item.key) === normalized) ?? null;
}

export function upsertMemory(
  memories: MemoryItem[],
  entry: MemoryWriteCommand,
  createId: () => string,
  now = Date.now(),
  source: MemoryItem["source"] = "usuario",
): MemoryItem[] {
  const normalized = normalizeMemoryKey(entry.key);
  const existing = memories.find((item) => normalizeMemoryKey(item.key) === normalized);
  const updated: MemoryItem = {
    id: existing?.id ?? createId(),
    kind: existing?.kind ?? entry.kind,
    key: existing?.key ?? entry.key,
    value: entry.value,
    createdAt: now,
    source,
  };
  return [updated, ...memories.filter((item) => normalizeMemoryKey(item.key) !== normalized)].slice(0, 200);
}
