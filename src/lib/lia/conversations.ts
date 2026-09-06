/** Histórico de conversas salvo no navegador (localStorage). */
import type { ChatMessage } from "./types";
import { uid } from "./defaults";

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

const LIST_KEY = "lia.conversations";
const ACTIVE_KEY = "lia.conversations.active";

export function readConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeConversations(list: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, 60)));
  } catch {
    /* armazenamento cheio — o histórico antigo é descartado silenciosamente */
  }
}

export function readActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function writeActiveId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
}

export function newConversation(): Conversation {
  return { id: uid(), title: "Nova conversa", updatedAt: Date.now(), messages: [] };
}

/** Título derivado da primeira fala do usuário. */
export function titleFor(messages: ChatMessage[]) {
  const first = messages.find((m) => m.role === "user")?.content.trim();
  if (!first) return "Nova conversa";
  return first.length > 42 ? `${first.slice(0, 42)}…` : first;
}
