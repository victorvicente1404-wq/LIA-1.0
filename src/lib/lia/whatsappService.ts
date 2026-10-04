// Client-safe: configuração local da Evolution API e funções do WhatsApp da Lia.
import { waChats, waMessages, waSend, waTest } from "./whatsapp.functions";

export interface WhatsAppConfig {
  url: string;
  apiKey: string;
  instance: string;
  /** Monitorar novas mensagens em segundo plano. */
  watch: boolean;
  /** Palavras que tornam uma mensagem "importante" (vazio = todas). */
  keywords: string;
}

const KEY = "lia.whatsapp";
const EVENT = "lia-whatsapp-config";

export const defaultWhatsAppConfig: WhatsAppConfig = {
  url: "",
  apiKey: "",
  instance: "Lia",
  watch: true,
  keywords: "",
};

export function readWhatsAppConfig(): WhatsAppConfig {
  if (typeof window === "undefined") return defaultWhatsAppConfig;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...defaultWhatsAppConfig, ...JSON.parse(raw) } : defaultWhatsAppConfig;
  } catch {
    return defaultWhatsAppConfig;
  }
}

export function writeWhatsAppConfig(cfg: WhatsAppConfig) {
  window.localStorage.setItem(KEY, JSON.stringify(cfg));
  window.dispatchEvent(new Event(EVENT));
}

export function onWhatsAppConfigChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function isConfigured(cfg: WhatsAppConfig = readWhatsAppConfig()) {
  return !!(cfg.url && cfg.apiKey && cfg.instance);
}

const creds = (c: WhatsAppConfig) => ({ url: c.url.trim(), apiKey: c.apiKey.trim(), instance: c.instance.trim() });

export function testConnection(cfg = readWhatsAppConfig()) {
  return waTest({ data: { cfg: creds(cfg) } });
}

export function sendMessage(to: string, text: string, cfg = readWhatsAppConfig()) {
  return waSend({ data: { cfg: creds(cfg), to, text } });
}

export function getChats(cfg = readWhatsAppConfig()) {
  return waChats({ data: { cfg: creds(cfg) } });
}

export function getMessages(chatId: string, limit = 20, cfg = readWhatsAppConfig()) {
  return waMessages({ data: { cfg: creds(cfg), chatId, limit } });
}

/** Credenciais para a Lia agir no WhatsApp durante a conversa (ou null). */
export function whatsappCredsForChat() {
  const cfg = readWhatsAppConfig();
  return isConfigured(cfg) ? creds(cfg) : null;
}
