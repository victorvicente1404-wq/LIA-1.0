/**
 * Captura de áudio com redução de ruído e medição de nível.
 *
 * Abre um fluxo getUserMedia com echoCancellation, noiseSuppression e
 * autoGainControl (mono), expõe um nível RMS normalizado (0–1) e um
 * detector de voz simples baseado em piso de ruído calibrado. Usado para
 * o medidor de nível na interface e para interromper a fala da Lia com
 * confiabilidade (vários frames acima do limiar), já que o Web Speech
 * sozinho dispara onspeechstart de forma ruidosa.
 *
 * Roda apenas no navegador; os métodos são inertes no SSR.
 */

export interface AudioMonitorCallbacks {
  /** Nível RMS 0–1 a cada frame (~30fps). */
  onLevel?: (level: number) => void;
  /** True quando voz sustentada é detectada; false ao silenciar. */
  onVoice?: (speaking: boolean) => void;
}

export interface AudioMonitor {
  start: () => Promise<void>;
  stop: () => void;
  getLevel: () => number;
  isSpeaking: () => boolean;
}

/**
 * Cria um monitor de áudio.
 * @param sensibilidade 0–100 (maior = mais sensível, limiar menor).
 * @param silencioMs    tempo de silêncio para considerar fim da fala.
 */
export function createAudioMonitor(
  sensibilidade: number,
  silencioMs: number,
  callbacks: AudioMonitorCallbacks = {},
): AudioMonitor {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let raf = 0;
  let buf: Uint8Array = new Uint8Array(0);
  let level = 0;
  let speaking = false;
  let lastVoice = 0;
  let framesAbove = 0;

  // Limiar de fala: sensibilidade alta baixa o limiar (mais sensível).
  const threshold = Math.max(0.035, 0.17 - (sensibilidade / 100) * 0.13);
  const framesNeeded = 3; // confirmação: N frames acima do limiar

  function computeLevel(): number {
    if (!analyser || buf.length === 0) return 0;
    analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = ((buf[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    level = computeLevel();
    callbacks.onLevel?.(level);
    const now = performance.now();
    if (level >= threshold) {
      framesAbove++;
    } else {
      framesAbove = Math.max(0, framesAbove - 1);
    }
    if (framesAbove >= framesNeeded) {
      lastVoice = now;
      if (!speaking) {
        speaking = true;
        callbacks.onVoice?.(true);
      }
    } else if (speaking && now - lastVoice > silencioMs) {
      speaking = false;
      callbacks.onVoice?.(false);
    }
  }

  async function start(): Promise<void> {
    if (typeof window === "undefined") return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    buf = new Uint8Array(analyser.fftSize);
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    loop();
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    speaking = false;
    level = 0;
    callbacks.onLevel?.(0);
    callbacks.onVoice?.(false);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (ctx) void ctx.close().catch(() => {});
    ctx = null;
    analyser = null;
  }

  return {
    start,
    stop,
    getLevel: () => level,
    isSpeaking: () => speaking,
  };
}
