/**
 * Casamento da wake word em texto reconhecido.
 * Aceita variações naturais de pronúncia, sem ser sensível demais.
 */

const VARIANTS = ["lia", "lya", "lía", "leah", "lea", "liá"];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Constrói o padrão da wake word (a palavra pode ser trocada nas configurações). */
export function wakeWordPattern(word: string) {
  const base = normalize(word).trim();
  const set = new Set<string>([base, ...(base === "lia" ? VARIANTS.map(normalize) : [])]);
  const alt = [...set].filter(Boolean).join("|");
  // Só vale no começo da frase ou após pausa/pontuação — evita disparos casuais.
  return new RegExp(`(?:^|[\\s,.;:!?—-])(${alt})(?=$|[\\s,.;:!?—-])`, "i");
}

export interface WakeMatch {
  matched: boolean;
  /** Texto restante depois da wake word (o comando na mesma frase). */
  command: string;
}

export function matchWakeWord(text: string, word: string): WakeMatch {
  const plain = normalize(text);
  const rx = wakeWordPattern(word);
  const m = rx.exec(plain);
  if (!m) return { matched: false, command: "" };
  // Mapeia o fim do casamento no texto normalizado para o texto original
  // (têm o mesmo comprimento: NFD removido preserva índices por caractere).
  const end = (m.index ?? 0) + m[0].length;
  const rest = text.slice(Math.min(end, text.length));
  return { matched: true, command: rest.replace(/^[\s,.;:!?—-]+/, "").trim() };
}

/** Remove uma wake word que apareça no começo de um comando. */
export function stripWakeWord(text: string, word: string) {
  const m = matchWakeWord(text, word);
  return m.matched ? m.command : text.trim();
}
