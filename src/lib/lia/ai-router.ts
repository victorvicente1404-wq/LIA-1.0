const STORAGE_KEY = "lia.ai.routingMode.v1";

export type AiRoutingMode = "local" | "hybrid";

/** Local is always the default; remote routing requires an explicit opt-in. */
export function readAiRoutingMode(): AiRoutingMode {
  if (typeof window === "undefined") return "local";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "hybrid" ? "hybrid" : "local";
  } catch {
    return "local";
  }
}

export function writeAiRoutingMode(mode: AiRoutingMode): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** Attachments remain local until remote attachment privacy/vision routing is implemented. */
export function shouldUseLunaForMessage(message: string, hasAttachments = false): boolean {
  if (readAiRoutingMode() !== "hybrid" || hasAttachments) return false;
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const explicit = /\b(?:use|usa|utilize|chame|mande para)\s+(?:a\s+)?(?:luna|modelo remoto|modelo online)\b/.test(normalized);
  if (explicit) return true;

  const complexIntent = /\b(?:arquitetura|implemente|implementacao|depure|debug|refatore|otimize|codigo|programacao|planejamento tecnico|analise aprofundada|analise detalhada|compare alternativas|pesquisa aprofundada|documentacao tecnica|resolva passo a passo|estrategia complexa)\b/.test(normalized);
  return complexIntent || message.length >= 1_600;
}
