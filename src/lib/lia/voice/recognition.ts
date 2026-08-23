/**
 * Reconhecimento de fala do navegador (Web Speech API), isolado num único
 * lugar. É a base tanto do motor de wake word de fallback quanto da
 * transcrição — nunca há duas sessões concorrentes.
 */
import type { SpeechChunk } from "./types";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

export function recognitionSupported() {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface RecognitionSession {
  start: () => void;
  stop: () => void;
  running: () => boolean;
  onChunk: (cb: (c: SpeechChunk) => void) => void;
  onError: (cb: (code: string) => void) => void;
  destroy: () => void;
}

/** Sessão compartilhada com reinício automático enquanto for desejada. */
export function createRecognition(lang = "pt-BR"): RecognitionSession | null {
  if (!recognitionSupported()) return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  const rec: Rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let wanted = false;
  let live = false;
  let chunkCb: (c: SpeechChunk) => void = () => {};
  let errCb: (code: string) => void = () => {};

  rec.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = (r[0]?.transcript ?? "").trim();
      if (text) chunkCb({ text, final: Boolean(r.isFinal) });
    }
  };

  rec.onerror = (e: any) => {
    const code = e?.error ?? "unknown";
    if (code === "not-allowed" || code === "service-not-allowed") {
      wanted = false;
      live = false;
    }
    errCb(code);
  };

  rec.onend = () => {
    live = false;
    if (!wanted) return;
    // Reinício automático: mantém a escuta viva sem intervenção do usuário.
    const retry = (delay: number) =>
      setTimeout(() => {
        if (!wanted || live) return;
        try {
          rec.start();
          live = true;
        } catch {
          if (delay < 3000) retry(delay * 2);
        }
      }, delay);
    retry(250);
  };

  return {
    start() {
      wanted = true;
      if (live) return;
      try {
        rec.start();
        live = true;
      } catch {
        /* já rodando */
      }
    },
    stop() {
      wanted = false;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    running: () => live,
    onChunk(cb) {
      chunkCb = cb;
    },
    onError(cb) {
      errCb = cb;
    },
    destroy() {
      wanted = false;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}
