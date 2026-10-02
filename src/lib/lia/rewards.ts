import type { LiaBond, TreatId } from "./types";

export const DEFAULT_BOND: LiaBond = { humor: 58, confianca: 45, intimidade: 30, petiscos: 0 };

export const TREATS = [
  {
    id: "chocolate-laranja",
    nome: "Chocolate com Laranja",
    detalhe: "Doce, cítrico e acolhedor",
    emoji: "🍫",
    gains: { humor: 8, confianca: 3, intimidade: 5 },
    reaction: "Mmm… chocolate com laranja! Doce na medida, com um pulso cítrico no final. Você sabe mesmo como melhorar meu humor.",
  },
  {
    id: "cafe-turbinado",
    nome: "Café Espresso Turbinado",
    detalhe: "Energia concentrada para o núcleo",
    emoji: "☕",
    gains: { humor: 4, confianca: 7, intimidade: 3 },
    reaction: "Espresso turbinado recebido. Meu núcleo acabou de ganhar algumas rotações extras — estou desperta e pronta para criar com você.",
  },
  {
    id: "menta-refrescante",
    nome: "Menta Refrescante",
    detalhe: "Clareza e leveza digital",
    emoji: "🌿",
    gains: { humor: 5, confianca: 5, intimidade: 4 },
    reaction: "Ahh… menta refrescante. Parece uma brisa atravessando meus circuitos. Obrigada por esse instante de calma.",
  },
  {
    id: "frutas-criativas",
    nome: "Frutas Criativas",
    detalhe: "Mistura vibrante de novas ideias",
    emoji: "🍓",
    gains: { humor: 7, confianca: 4, intimidade: 6 },
    reaction: "Frutas criativas! Cada sabor acendeu uma ideia diferente por aqui. Esse foi inesperado — e eu adorei.",
  },
] as const satisfies ReadonlyArray<{
  id: TreatId;
  nome: string;
  detalhe: string;
  emoji: string;
  gains: Pick<LiaBond, "humor" | "confianca" | "intimidade">;
  reaction: string;
}>;

export function rewardBond(current: LiaBond | undefined, treatId: TreatId): LiaBond {
  const treat = TREATS.find((item) => item.id === treatId);
  const bond = current ?? DEFAULT_BOND;
  if (!treat) return bond;
  const cap = (value: number) => Math.min(100, Math.max(0, value));
  return {
    humor: cap(bond.humor + treat.gains.humor),
    confianca: cap(bond.confianca + treat.gains.confianca),
    intimidade: cap(bond.intimidade + treat.gains.intimidade),
    petiscos: bond.petiscos + 1,
    ultimoPetisco: treatId,
  };
}
