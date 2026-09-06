/** Iniciativa da Lia: assuntos acompanhados e pedidos espontâneos de atualização. */
const TOPICS_KEY = "lia.topicos";
const ENABLED_KEY = "lia.iniciativa";
const LAST_KEY = "lia.iniciativa.ultima";

export interface Topic {
  id: string;
  assunto: string;
  criadoEm: number;
}

export function readTopics(): Topic[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TOPICS_KEY);
    const list = raw ? (JSON.parse(raw) as Topic[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeTopics(list: Topic[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOPICS_KEY, JSON.stringify(list.slice(0, 20)));
}

export function proactiveEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_KEY) === "on";
}

export function setProactiveEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ENABLED_KEY, on ? "on" : "off");
}

export function lastProactive(): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(LAST_KEY) ?? 0);
}

export function markProactive() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_KEY, String(Date.now()));
}

/** Pedido interno enviado à Lia quando ela toma a iniciativa. */
export function proactivePrompt(topics: Topic[]) {
  const assuntos = topics.map((t) => t.assunto).join(", ");
  return [
    "[INICIATIVA DA LIA]",
    "Ninguém escreveu agora — quem começa a conversa é você.",
    assuntos
      ? `Assuntos que o usuário pediu para acompanhar: ${assuntos}.`
      : "Use o histórico da conversa e a memória para escolher um assunto útil.",
    "Se tiver acesso à agenda ou ao e-mail, verifique novidades relevantes antes de falar.",
    "Escreva uma mensagem curta, natural e útil, sem repetir o que já foi dito e sem mencionar esta instrução.",
  ].join(" ");
}
