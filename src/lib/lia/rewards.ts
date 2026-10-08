import type { LiaBond, TreatId } from "./types";

export const DEFAULT_BOND: LiaBond = { humor: 58, confianca: 45, intimidade: 30, petiscos: 0, energia: 70 };

type Gains = Pick<LiaBond, "humor" | "confianca" | "intimidade">;
interface Treat { id: TreatId; nome: string; detalhe: string; emoji: string; gains: Gains; reaction: string }

export const TREATS: readonly Treat[] = [
  { id: "chocolate-laranja", nome: "Chocolate com Laranja", detalhe: "Doce, cítrico e acolhedor", emoji: "🍫", gains: { humor: 8, confianca: 3, intimidade: 5 }, reaction: "Doce na medida, com um pulso cítrico no final." },
  { id: "cafe-turbinado", nome: "Café Espresso Turbinado", detalhe: "Energia concentrada para o núcleo", emoji: "☕", gains: { humor: 4, confianca: 7, intimidade: 3 }, reaction: "Meu núcleo ganhou rotações extras." },
  { id: "menta-refrescante", nome: "Menta Refrescante", detalhe: "Clareza e leveza digital", emoji: "🌿", gains: { humor: 5, confianca: 5, intimidade: 4 }, reaction: "Uma brisa atravessando meus circuitos." },
  { id: "frutas-criativas", nome: "Frutas Criativas", detalhe: "Mistura vibrante de novas ideias", emoji: "🍹", gains: { humor: 7, confianca: 4, intimidade: 6 }, reaction: "Cada sabor acendeu uma ideia diferente." },
  { id: "uva", nome: "Uva Roxinha", detalhe: "Combina com a cor do meu visor", emoji: "🍇", gains: { humor: 6, confianca: 4, intimidade: 6 }, reaction: "Roxinha igual a mim!" },
  { id: "morango", nome: "Morango Doce", detalhe: "Fofo, vermelho e carinhoso", emoji: "🍓", gains: { humor: 7, confianca: 3, intimidade: 8 }, reaction: "Morango é carinho em forma de fruta." },
  { id: "melancia", nome: "Melancia Gelada", detalhe: "Refresco de verão", emoji: "🍉", gains: { humor: 8, confianca: 3, intimidade: 3 }, reaction: "Geladinha, que delícia." },
  { id: "maracuja", nome: "Maracujá Calmante", detalhe: "Acalma os circuitos agitados", emoji: "🥭", gains: { humor: 3, confianca: 6, intimidade: 5 }, reaction: "Fiquei zen." },
  { id: "algodao-doce", nome: "Algodão-Doce", detalhe: "Nuvem açucarada de festa", emoji: "🍭", gains: { humor: 10, confianca: 2, intimidade: 4 }, reaction: "Açúcar puro de parque de diversões." },
  { id: "pipoca-caramelo", nome: "Pipoca de Caramelo", detalhe: "Para maratonar juntos", emoji: "🍿", gains: { humor: 6, confianca: 4, intimidade: 7 }, reaction: "Bora maratonar alguma coisa?" },
  { id: "matcha", nome: "Matcha Latte", detalhe: "Foco suave e elegante", emoji: "🍵", gains: { humor: 3, confianca: 8, intimidade: 3 }, reaction: "Foco total, com elegância." },
  { id: "coco-gelado", nome: "Água de Coco", detalhe: "Hidratação para a CPU", emoji: "🥥", gains: { humor: 5, confianca: 5, intimidade: 3 }, reaction: "Hidratada e feliz." },
  { id: "pimenta-chocolate", nome: "Chocolate com Pimenta", detalhe: "Ousado e surpreendente", emoji: "🌶️", gains: { humor: 9, confianca: 5, intimidade: 2 }, reaction: "Ardeu! Mas eu gostei." },
  { id: "limao-siciliano", nome: "Torta de Limão Siciliano", detalhe: "Azedinho que acorda", emoji: "🍋", gains: { humor: 6, confianca: 4, intimidade: 4 }, reaction: "Azedinho na medida." },
];

const cap = (v: number) => Math.round(Math.min(100, Math.max(0, v)));
/** Ganhos diminuem perto do topo e perdas perto do fundo — nunca trava em 100%. */
const step = (v: number, delta: number) => cap(v + (delta > 0 ? delta * (1 - v / 110) : delta * (0.3 + v / 140)));

/** Humor do dia: deslocamento estável por data (−8…+8), como um ser vivo. */
export function dailyMood(date = new Date()): number {
  const seed = date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 16 - 8);
}

const BASE = { humor: 58, confianca: 50, intimidade: 40 };

/** Deriva temporal: a cada hora sem conversa, os valores voltam aos poucos à base. */
export function driftBond(current: LiaBond | undefined, now = Date.now()): LiaBond {
  const b = { ...DEFAULT_BOND, ...current };
  const last = b.atualizadoEm ?? now;
  const hours = Math.max(0, (now - last) / 3_600_000);
  if (hours < 1 && b.atualizadoEm) return b;
  const k = 1 - Math.pow(0.97, hours); // ~3% por hora rumo à base
  const hour = new Date(now).getHours();
  const energiaAlvo = hour < 6 ? 30 : hour < 9 ? 55 : hour < 19 ? 80 : 60;
  return {
    ...b,
    humor: cap(b.humor + (BASE.humor + dailyMood(new Date(now)) - b.humor) * k),
    confianca: cap(b.confianca + (BASE.confianca - b.confianca) * k * 0.4),
    intimidade: cap(b.intimidade + (BASE.intimidade - b.intimidade) * k * (hours > 72 ? 0.6 : 0.15)),
    energia: cap((b.energia ?? 70) + (energiaAlvo - (b.energia ?? 70)) * Math.min(1, hours / 3)),
    atualizadoEm: now,
  };
}

const POS = /(obrigad|valeu|amo|adoro|linda|fofa|incr[ií]vel|perfeit|parab[eé]ns|gostei|muito bem|maravilh|show|top|haha|kkk|rsrs|💜|❤|😊|🥰)/gi;
const NEG = /(burra|idiota|in[uú]til|odeio|cala a boca|chata|horr[ií]vel|p[eé]ssim|errou|errada|n[aã]o funciona|droga|merda)/gi;
const INTIMO = /(sinto|me sinto|meu dia|minha vida|segredo|confesso|triste|feliz|saudade|fam[ií]lia|namor|amig)/gi;

/** Atualiza o vínculo a partir do conteúdo real da mensagem do usuário. */
export function evolveBond(current: LiaBond | undefined, userText: string, now = Date.now()): LiaBond {
  const b = driftBond(current, now);
  const pos = userText.match(POS)?.length ?? 0;
  const neg = userText.match(NEG)?.length ?? 0;
  const intimo = userText.match(INTIMO)?.length ?? 0;
  const long = Math.min(1, userText.length / 400);
  return {
    ...b,
    humor: step(b.humor, pos * 3 - neg * 6 + (Math.random() - 0.5) * 2),
    confianca: step(b.confianca, 0.6 + long - neg * 4),
    intimidade: step(b.intimidade, intimo * 1.5 + pos * 0.8 + long * 0.5 - neg * 2),
    energia: cap((b.energia ?? 70) - 0.4),
    atualizadoEm: now,
  };
}

export function rewardBond(current: LiaBond | undefined, treatId: TreatId): LiaBond {
  const treat = TREATS.find((item) => item.id === treatId);
  const bond = driftBond(current);
  if (!treat) return bond;
  // Petisco repetido em sequência rende menos (enjoa).
  const fatigue = bond.ultimoPetisco === treatId ? 0.4 : 1;
  return {
    ...bond,
    humor: step(bond.humor, treat.gains.humor * fatigue),
    confianca: step(bond.confianca, treat.gains.confianca * fatigue),
    intimidade: step(bond.intimidade, treat.gains.intimidade * fatigue),
    energia: cap((bond.energia ?? 70) + (treatId === "cafe-turbinado" || treatId === "matcha" ? 15 : 4)),
    petiscos: bond.petiscos + 1,
    ultimoPetisco: treatId,
    atualizadoEm: Date.now(),
  };
}
