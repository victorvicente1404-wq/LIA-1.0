import { ROOMS } from "./device";

type LocalCommand = { pin: number; value: 0 | 1; name: string };
type ParseResult = { command: LocalCommand } | { error: string } | null;

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const aliases: Record<string, string> = {
  "quarto grande": "Suíte Master", "quarto casal": "Suíte Master", "quarto de casal": "Suíte Master",
  "quarto pequeno": "Quarto de Solteiro",
};

/** Only explicit, single-target commands are executed; ordinary conversation stays with AI. */
export function parseArduinoChat(text: string): ParseResult {
  const match = normalize(text).match(/^(?:lia[, ]+)?(?:por favor[, ]+)?(ligue|liga|ligar|acenda|acende|acender|desligue|desliga|desligar|apague|apaga|apagar)\s+(?:(?:a|o)\s+)?(?:(?:luz|led|lampada)\s+(?:da|do|de)\s+)?(.+?)(?:[, ]+por favor)?[.!?]*$/);
  if (!match) return null;
  const value: 0 | 1 = /^(deslig|apag)/.test(match[1] ?? "") ? 0 : 1;
  const target = (match[2] ?? "").trim();
  const pinMatch = target.match(/^pino\s+(\d+)$/);
  if (pinMatch) {
    const pin = Number(pinMatch[1]);
    if (pin < 2 || pin > 19) return { error: "Use um pino de 2 a 19 no Arduino Uno; os pinos 0 e 1 são reservados para a comunicação USB." };
    const room = ROOMS.find((r) => r.pin === pin);
    return { command: { pin, value, name: room?.nome ?? `Pino ${pin}` } };
  }
  const room = ROOMS.find((r) => normalize(r.nome) === target || normalize(r.nome) === normalize(aliases[target] ?? ""));
  return room ? { command: { pin: room.pin, value, name: room.nome } } : null;
}