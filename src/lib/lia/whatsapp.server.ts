// Server-only. Cliente da Evolution API (WhatsApp). Recebe a configuração do usuário a cada chamada.
export interface EvolutionConfig {
  url: string;
  apiKey: string;
  instance: string;
}

export interface WaChat {
  id: string;
  name: string;
  isGroup: boolean;
  unread: number;
  lastMessage: string | null;
  lastAt: number | null;
}

export interface WaMessage {
  id: string;
  chatId: string;
  fromMe: boolean;
  sender: string | null;
  text: string;
  at: number | null;
}

function baseUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("A URL da API precisa começar com https://");
  const h = u.hostname;
  if (
    h === "localhost" ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) ||
    h.endsWith(".internal")
  )
    throw new Error("Endereço da API não permitido.");
  return u.origin + u.pathname.replace(/\/+$/, "");
}

async function call<T>(cfg: EvolutionConfig, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl(cfg.url)}${path}/${encodeURIComponent(cfg.instance)}`, {
    method,
    headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 300);
    console.error(`Evolution API [${res.status}] ${path}: ${txt}`);
    if (res.status === 401 || res.status === 403) throw new Error("API Key do WhatsApp inválida.");
    if (res.status === 404) throw new Error("Instância do WhatsApp não encontrada.");
    throw new Error(`O WhatsApp respondeu com erro (${res.status}).`);
  }
  return (await res.json()) as T;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string" && v) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
    const d = Date.parse(v);
    return Number.isNaN(d) ? null : d;
  }
  return null;
}

function messageText(m: any): string {
  if (!m) return "";
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    (m.imageMessage ? "[imagem]" : m.audioMessage ? "[áudio]" : m.documentMessage ? "[documento]" : m.stickerMessage ? "[figurinha]" : "")
  );
}

export async function testConnection(cfg: EvolutionConfig) {
  const r = await call<{ instance?: { state?: string } }>(cfg, "GET", "/instance/connectionState");
  const state = r.instance?.state ?? "unknown";
  return { connected: state === "open", state };
}

export function normalizeNumber(to: string) {
  if (to.includes("@")) return to;
  const digits = to.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("Número de WhatsApp inválido.");
  return digits;
}

export async function sendMessage(cfg: EvolutionConfig, to: string, text: string) {
  await call(cfg, "POST", "/message/sendText", { number: normalizeNumber(to), text });
  return { ok: true, to };
}

export async function getChats(cfg: EvolutionConfig): Promise<WaChat[]> {
  const raw = await call<any>(cfg, "POST", "/chat/findChats", {});
  const list: any[] = Array.isArray(raw) ? raw : (raw?.chats ?? raw?.records ?? []);
  return list
    .map((c) => {
      const id: string = c.remoteJid ?? c.id ?? "";
      const last = c.lastMessage;
      return {
        id,
        name: c.pushName ?? c.name ?? c.subject ?? id.split("@")[0],
        isGroup: id.endsWith("@g.us"),
        unread: Number(c.unreadCount ?? c.unreadMessages ?? 0) || 0,
        lastMessage: last ? messageText(last.message) || null : null,
        lastAt: toNumber(last?.messageTimestamp ?? c.updatedAt),
      };
    })
    .filter((c) => c.id && !c.id.includes("status@broadcast"))
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .slice(0, 60);
}

export async function getMessages(cfg: EvolutionConfig, chatId: string, limit = 20): Promise<WaMessage[]> {
  const jid = chatId.includes("@") ? chatId : `${normalizeNumber(chatId)}@s.whatsapp.net`;
  const raw = await call<any>(cfg, "POST", "/chat/findMessages", {
    where: { key: { remoteJid: jid } },
    limit,
    page: 1,
  });
  const list: any[] = Array.isArray(raw) ? raw : (raw?.messages?.records ?? raw?.records ?? []);
  return list
    .map((m) => ({
      id: m.key?.id ?? m.id ?? "",
      chatId: jid,
      fromMe: !!m.key?.fromMe,
      sender: m.pushName ?? null,
      text: messageText(m.message),
      at: toNumber(m.messageTimestamp),
    }))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    .slice(-limit);
}
