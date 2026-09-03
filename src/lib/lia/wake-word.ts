/**
 * Detecção da palavra de ativação ("Lia").
 *
 * Normaliza acentos e caixa e aceita variações no início da frase
 * ("lia", "ei lia", "olá lia", "opa lia"). O texto após a palavra
 * já entra como primeira pergunta; se houver só a palavra, a Lia
 * apenas acorda e espera.
 */

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GREETINGS = ["ola", "olá", "ei", "opa", "fala", "hey", "oi"];

export interface WakeMatch {
  matched: boolean;
  /** Texto restante depois da palavra de ativação (vazio se só a palavra). */
  query: string;
}

export function matchWakeWord(text: string, word: string): WakeMatch {
  const n = normalizeText(text);
  const w = normalizeText(word);
  if (!w) return { matched: false, query: n };

  const wordRe = escapeRegex(w);
  const greet = `(?:${GREETINGS.map(escapeRegex).join("|")})\\s+`;
  // Correspondência no início: [saudação?] palavra [separador]
  const startRe = new RegExp(`^(?:${greet})?${wordRe}(?:[\\s,;:.!?]+|$)`, "i");
  const startMatch = n.match(startRe);
  if (startMatch) {
    const after = n.slice(startMatch[0].length).trim();
    return { matched: true, query: after };
  }
  // Correspondência em qualquer lugar como palavra inteira.
  const anyRe = new RegExp(`(?:^|\\s)(?:${greet})?${wordRe}(?:[\\s,;:.!?]+|$)`, "i");
  const anyMatch = n.match(anyRe);
  if (anyMatch && anyMatch.index !== undefined) {
    const before = n.slice(0, anyMatch.index).trim();
    const after = n.slice(anyMatch.index + anyMatch[0].length).trim();
    return { matched: true, query: after || before };
  }
  return { matched: false, query: n };
}
