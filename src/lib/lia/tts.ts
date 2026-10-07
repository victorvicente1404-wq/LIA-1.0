/**
 * Motor de fala (TTS) da Lia.
 *
 *   Texto da Lia  →  Motor TTS  →  Áudio
 *
 * A interface `TtsEngine` isola o provedor: hoje usamos a síntese do
 * navegador com prosódia melhorada; amanhã um provedor neural pode ser
 * plugado aqui sem alterar o restante do aplicativo.
 */

export interface TtsSpeakOptions {
  velocidade?: number;
  tom?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface TtsEngine {
  readonly id: string;
  readonly supported: boolean;
  speak: (text: string, opts?: TtsSpeakOptions) => void;
  cancel: () => void;
}

/** Limpa marcações que não devem ser lidas em voz alta. */
export function textToSpeech(text: string): string {
  return text
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/```[\s\S]*?```/g, " (trecho de código) ")
    .replace(/_Humor[^_\n]*_/g, "")
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u20E3\u200D]/gu, "")
    .replace(/:[a-z0-9_+-]+:/gi, "")
    .replace(/[*_#`>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Divide o texto em unidades curtas de fala — a base do ritmo natural. */
export function splitProsody(text: string): { text: string; pauseAfter: number }[] {
  const parts: { text: string; pauseAfter: number }[] = [];
  const sentences = text.match(/[^.!?…\n]+[.!?…]*/g) ?? [text];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    // Frases longas ganham respiro interno nas vírgulas.
    if (s.length > 140) {
      const chunks = s.split(/,\s*/);
      chunks.forEach((c, i) =>
        parts.push({ text: i < chunks.length - 1 ? `${c},` : c, pauseAfter: i < chunks.length - 1 ? 120 : 260 }),
      );
      continue;
    }
    const pause = /[?]$/.test(s) ? 320 : /[!…]$/.test(s) ? 280 : 220;
    parts.push({ text: s, pauseAfter: pause });
  }
  return parts;
}

const VOICE_PREFERENCE = [
  /google.*portugu/i,
  /natural|neural|online|premium|enhanced/i,
  /luciana|francisca|maria|fernanda|camila|joana|ines/i,
  /female|feminin/i,
];

function pickVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices().filter((v) => /^pt/i.test(v.lang));
  if (!all.length) return null;
  const br = all.filter((v) => /pt[-_]?BR/i.test(v.lang));
  const pool = br.length ? br : all;
  for (const rx of VOICE_PREFERENCE) {
    const hit = pool.find((v) => rx.test(v.name));
    if (hit) return hit;
  }
  return pool[0] ?? null;
}

/** Motor padrão: Web Speech API com prosódia humanizada. */
export function createBrowserTts(): TtsEngine {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  return {
    id: "web-speech",
    supported: typeof window !== "undefined" && "speechSynthesis" in window,
    cancel,
    speak(raw, opts = {}) {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const clean = textToSpeech(raw);
      if (!clean) return;
      cancel();
      cancelled = false;

      const voice = pickVoice();
      const parts = splitProsody(clean);
      const baseRate = opts.velocidade ?? 1;
      const basePitch = opts.tom ?? 1.06;
      let started = false;

      const speakPart = (i: number) => {
        if (cancelled || i >= parts.length) {
          if (!cancelled) opts.onEnd?.();
          return;
        }
        const part = parts[i]!;
        const u = new SpeechSynthesisUtterance(part.text);
        u.lang = "pt-BR";
        if (voice) u.voice = voice;
        // Variação sutil de ritmo e entonação evita o efeito "robô".
        const question = /\?$/.test(part.text);
        const drift = ((i % 3) - 1) * 0.035;
        u.rate = Math.min(1.35, Math.max(0.75, baseRate * (0.97 + drift) - (question ? 0.03 : 0)));
        u.pitch = Math.min(1.6, Math.max(0.6, basePitch + (question ? 0.07 : drift * 1.2)));
        u.volume = 1;
        u.onstart = () => {
          setBrowserSpeaking(true);
          if (!started) {
            started = true;
            opts.onStart?.();
          }
        };
        u.onend = () => {
          setBrowserSpeaking(false);
          if (cancelled) return;
          timer = setTimeout(() => speakPart(i + 1), part.pauseAfter);
        };
        u.onerror = () => {
          if (!cancelled) speakPart(i + 1);
        };
        window.speechSynthesis.speak(u);
      };

      // Garante que a lista de vozes esteja carregada antes de falar.
      if (!window.speechSynthesis.getVoices().length) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          speakPart(0);
        };
        timer = setTimeout(() => speakPart(0), 350);
      } else {
        speakPart(0);
      }
    },
  };
}

/**
 * Motor ElevenLabs: voz neural feminina da Lia.
 * Se a síntese falhar (sem chave, cota, rede), cai para o motor do navegador.
 */
// Nível de voz em tempo real (0–1) para o lip-sync do rosto da Lia.
let speechCtx: AudioContext | null = null;
let speechAnalyser: AnalyserNode | null = null;
let speechBuf: Uint8Array<ArrayBuffer> | null = null;
let browserSpeaking = false;

function ensureSpeechCtx() {
  if (typeof window === "undefined") return null;
  if (!speechCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    speechCtx = new Ctx();
    speechAnalyser = speechCtx.createAnalyser();
    speechAnalyser.fftSize = 512;
    speechAnalyser.connect(speechCtx.destination);
    speechBuf = new Uint8Array(new ArrayBuffer(speechAnalyser.fftSize));
  }
  if (speechCtx.state === "suspended") void speechCtx.resume().catch(() => {});
  return speechCtx;
}

// Destrava o áudio no primeiro toque/clique (política de autoplay).
if (typeof window !== "undefined") {
  const unlock = () => {
    ensureSpeechCtx();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function setBrowserSpeaking(v: boolean) {
  browserSpeaking = v;
}

/** Volume atual da fala da Lia (0–1). Para a voz do navegador, -1 = desconhecido. */
export function getSpeechLevel(): number {
  if (speechAnalyser && speechBuf && activeElevenAudio && !activeElevenAudio.paused) {
    speechAnalyser.getByteTimeDomainData(speechBuf);
    let sum = 0;
    for (let i = 0; i < speechBuf.length; i++) {
      const v = (speechBuf[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / speechBuf.length) * 4.5);
  }
  return browserSpeaking ? -1 : 0;
}

let activeElevenAudio: HTMLAudioElement | null = null;

export function createElevenLabsTts(fallback: TtsEngine): TtsEngine {
  let audio: HTMLAudioElement | null = null;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio = null;
    }
    fallback.cancel();
  };

  return {
    id: "elevenlabs",
    supported: typeof window !== "undefined",
    cancel,
    speak(raw, opts = {}) {
      if (typeof window === "undefined") return;
      const clean = textToSpeech(raw);
      if (!clean) return;
      cancel();
      cancelled = false;

      void (async () => {
        try {
          const { synthesizeSpeech } = await import("./tts.functions");
          const res = await synthesizeSpeech({ data: { text: clean } });
          if (cancelled) return;
          const a = new Audio(res.audio);
          audio = a;
          activeElevenAudio = a;
          const ctx = ensureSpeechCtx();
          if (ctx && speechAnalyser) {
            try {
              ctx.createMediaElementSource(a).connect(speechAnalyser);
            } catch {
              /* sem analisador: toca direto */
            }
          }
          let started = false;
          a.onplay = () => {
            if (!started) {
              started = true;
              opts.onStart?.();
            }
          };
          a.onended = () => {
            if (!cancelled) opts.onEnd?.();
          };
          a.onerror = () => {
            if (!cancelled) fallback.speak(raw, opts);
          };
          await a.play();
        } catch {
          if (!cancelled) fallback.speak(raw, opts);
        }
      })();
    },
  };
}

/** Instância singleton do motor de TTS ativo. */
const ttsEngine =
  typeof window !== "undefined" ? createElevenLabsTts(createBrowserTts()) : null;

/** Fala o texto usando o motor TTS ativo. */
export function speak(text: string, opts?: TtsSpeakOptions) {
  ttsEngine?.speak(text, opts);
}

/** Interrompe a fala em andamento. */
export function cancelSpeech() {
  ttsEngine?.cancel();
}
