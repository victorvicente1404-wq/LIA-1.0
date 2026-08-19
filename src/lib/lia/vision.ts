/**
 * Módulo de Visão da Lia.
 *
 * Arquitetura: Câmera → captura → frame atual → módulo de visão → observação.
 * Esta camada é independente da interface e do modelo de IA, para que o
 * "modelo de visão" possa ser trocado no futuro sem tocar no resto do app.
 */

export type VisionStatus =
  | "desligada" // câmera desligada pelo usuário
  | "indisponivel" // sem permissão / sem dispositivo
  | "ativa"; // câmera ligada e produzindo frames

export interface VisionFrame {
  /** data URL JPEG do frame atual */
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: number;
}

export interface VisionObservation {
  status: VisionStatus;
  frame: VisionFrame | null;
  /** presença detectada por variação de imagem (movimento) */
  presence: boolean;
  /** 0..1 — quanto a cena mudou desde o frame anterior */
  change: number;
  lastChangeAt: number | null;
  erro: string | null;
}

type FrameProvider = () => VisionFrame | null;

const initial: VisionObservation = {
  status: "desligada",
  frame: null,
  presence: false,
  change: 0,
  lastChangeAt: null,
  erro: null,
};

let observation: VisionObservation = initial;
let provider: FrameProvider | null = null;
const listeners = new Set<(o: VisionObservation) => void>();

const emit = () => listeners.forEach((l) => l(observation));

export const visionSource = {
  /** A camada de câmera (PerceptionPanel) registra como capturar um frame. */
  setProvider(fn: FrameProvider | null) {
    provider = fn;
  },
  setStatus(status: VisionStatus, erro: string | null = null) {
    observation = {
      ...observation,
      status,
      erro,
      ...(status === "ativa" ? {} : { frame: null, presence: false, change: 0 }),
    };
    emit();
  },
  /** Chamado pelo loop de percepção contínua. */
  pushFrame(frame: VisionFrame, change: number, presence: boolean) {
    observation = {
      ...observation,
      frame,
      change,
      presence,
      lastChangeAt: change > 0.06 ? Date.now() : observation.lastChangeAt,
    };
    emit();
  },
  /** Frame atual sob demanda (usado antes de enviar uma pergunta à Lia). */
  captureNow(): VisionFrame | null {
    if (observation.status !== "ativa") return null;
    const fresh = provider?.() ?? null;
    if (fresh) observation = { ...observation, frame: fresh };
    return fresh ?? observation.frame;
  },
  get(): VisionObservation {
    return observation;
  },
  subscribe(fn: (o: VisionObservation) => void) {
    listeners.add(fn);
    fn(observation);
    return () => listeners.delete(fn);
  },
};

/** Descrição textual honesta do estado da visão, para o system prompt. */
export function describeVision(o: VisionObservation, moduleOn: boolean): string {
  if (!moduleOn) return "Módulo de Visão desativado nas configurações — você não está vendo nada.";
  if (o.status === "indisponivel")
    return "A câmera está indisponível ou sem permissão — você não consegue ver agora.";
  if (o.status === "desligada") return "A câmera está desligada — você não está vendo nada agora.";
  if (!o.frame)
    return "A câmera está ligando, mas ainda não há um frame válido — você ainda não está vendo.";
  return [
    "A câmera está ATIVA e o frame atual foi enviado junto com esta mensagem: você está realmente vendo.",
    `Presença detectada por movimento: ${o.presence ? "sim" : "não"}.`,
    `Variação recente da cena: ${(o.change * 100).toFixed(0)}%.`,
    "Descreva apenas o que realmente aparece na imagem enviada. Nunca invente.",
  ].join("\n");
}
