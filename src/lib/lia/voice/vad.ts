/**
 * VAD — detecção de atividade de voz por energia.
 * Marca início e fim da fala para que a Lia processe uma fala por vez
 * e ignore ruído de fundo.
 */
import type { AudioSession } from "./audio-processor";

export interface VadOptions {
  /** Energia mínima considerada fala. */
  threshold?: number;
  /** Silêncio (ms) necessário para considerar a fala encerrada. */
  hangoverMs?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onLevel?: (level: number) => void;
}

export interface Vad {
  stop: () => void;
  speaking: () => boolean;
}

export function startVad(session: AudioSession, opts: VadOptions = {}): Vad {
  const threshold = opts.threshold ?? 0.022;
  const hangover = opts.hangoverMs ?? 900;
  let speaking = false;
  let lastLoud = 0;
  let raf = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const level = session.level();
    opts.onLevel?.(level);
    const now = Date.now();
    if (level > threshold) {
      lastLoud = now;
      if (!speaking) {
        speaking = true;
        opts.onSpeechStart?.();
      }
    } else if (speaking && now - lastLoud > hangover) {
      speaking = false;
      opts.onSpeechEnd?.();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    speaking: () => speaking,
  };
}
