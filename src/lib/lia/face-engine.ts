/**
 * Motor facial paramétrico da Lia: valores contínuos (0–1 ou -1–1) que o
 * rosto interpola com molas. A IA, o Painel Dev e as emoções escrevem aqui.
 */
export interface FaceParams {
  eyeOpen: number; // 0 fechado … 1 normal … 1.4 arregalado
  eyeSmile: number; // 0 olho normal … 1 arco feliz "^^"
  browRaise: number; // -1 franzida … 1 erguida
  browTilt: number; // -1 triste … 1 brava
  mouthSmile: number; // -1 triste … 1 sorriso aberto
  mouthOpen: number; // 0 … 1 (somado ao lip-sync)
  blush: number; // 0 … 1
  headTilt: number; // graus, -15 … 15
}

export type FaceGesture = "nod" | "shake" | "tilt" | "blink" | "blush" | "bounce";

export const NEUTRAL_FACE: FaceParams = {
  eyeOpen: 1, eyeSmile: 0, browRaise: 0, browTilt: 0, mouthSmile: 0, mouthOpen: 0, blush: 0, headTilt: 0,
};

const RANGES: Record<keyof FaceParams, [number, number]> = {
  eyeOpen: [0, 1.4], eyeSmile: [0, 1], browRaise: [-1, 1], browTilt: [-1, 1],
  mouthSmile: [-1, 1], mouthOpen: [0, 1], blush: [0, 1], headTilt: [-15, 15],
};
export const FACE_RANGES = RANGES;

type Listener = () => void;
let override: Partial<FaceParams> = {};
let overrideUntil = 0;
let gestureSeq = 0;
let lastGesture: { id: number; g: FaceGesture } | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export function subscribeFace(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Sobrescreve parâmetros por `ms` (0 = até limpar). */
export function setFaceOverride(p: Partial<FaceParams>, ms = 6000) {
  const clean: Partial<FaceParams> = {};
  for (const [k, v] of Object.entries(p) as [keyof FaceParams, number][]) {
    if (!(k in RANGES) || !Number.isFinite(v)) continue;
    const [lo, hi] = RANGES[k];
    clean[k] = Math.min(hi, Math.max(lo, v));
  }
  override = { ...override, ...clean };
  overrideUntil = ms > 0 ? Date.now() + ms : Infinity;
  emit();
}

export function clearFaceOverride() {
  override = {};
  overrideUntil = 0;
  emit();
}

export function getFaceOverride(): Partial<FaceParams> {
  if (Date.now() > overrideUntil && Object.keys(override).length) override = {};
  return override;
}

export function triggerGesture(g: FaceGesture) {
  lastGesture = { id: ++gestureSeq, g };
  emit();
}

const EMPTY: Partial<FaceParams> = {};
export function getEmptyOverride() {
  return EMPTY;
}

export function getLastGesture() {
  return lastGesture;
}

/** Combina a base emocional com o override atual. */
export function mergeFace(base: FaceParams): FaceParams {
  return { ...base, ...getFaceOverride() };
}

const GESTURE_ALIASES: Record<string, FaceGesture> = {
  nod: "nod", sim: "nod", acenar_sim: "nod",
  shake: "shake", nao: "shake", não: "shake", balancar_nao: "shake",
  tilt: "tilt", inclinar: "tilt", curiosa: "tilt",
  blink: "blink", piscar: "blink",
  blush: "blush", corar: "blush",
  bounce: "bounce", pular: "bounce", animada: "bounce",
};

const PARAM_ALIASES: Record<string, keyof FaceParams> = {
  olhos: "eyeOpen", eyeopen: "eyeOpen", olhos_felizes: "eyeSmile", eyesmile: "eyeSmile",
  sobrancelha: "browRaise", browraise: "browRaise", inclinacao_sobrancelha: "browTilt", browtilt: "browTilt",
  sorriso: "mouthSmile", mouthsmile: "mouthSmile", boca: "mouthOpen", mouthopen: "mouthOpen",
  blush: "blush", bochechas: "blush", cabeca: "headTilt", headtilt: "headTilt",
};

/**
 * A Lia controla o próprio rosto escrevendo tags no texto, ex.:
 * [[rosto: gesto=sim; sorriso=0.8; blush=0.6]]. Retorna o texto sem as tags.
 */
export function applyFaceTags(text: string): string {
  return text.replace(/\[\[\s*rosto\s*:([^\]]*)\]\]/gi, (_m, body: string) => {
    const params: Partial<FaceParams> = {};
    for (const part of body.split(/[;,]/)) {
      const [rawK, rawV] = part.split("=").map((s) => s?.trim().toLowerCase());
      if (!rawK || rawV === undefined) continue;
      if (rawK === "gesto" || rawK === "gesture") {
        const g = GESTURE_ALIASES[rawV.replace(/\s+/g, "_")];
        if (g) triggerGesture(g);
        continue;
      }
      const key = PARAM_ALIASES[rawK.replace(/\s+/g, "_")];
      const n = Number(rawV);
      if (key && Number.isFinite(n)) params[key] = n;
    }
    if (Object.keys(params).length) setFaceOverride(params, 8000);
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
}
