/**
 * AudioProcessor — captura o microfone com cancelamento de eco, redução de
 * ruído e ganho automático, e expõe o nível de energia para o VAD.
 */

export interface AudioSession {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  /** Energia (RMS) atual, 0..1. */
  level: () => number;
  close: () => void;
}

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export async function openAudioSession(): Promise<AudioSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
  const Ctx: typeof AudioContext =
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Ctx();
  if (context.state === "suspended") await context.resume().catch(() => undefined);

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);

  return {
    stream,
    context,
    analyser,
    level() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
      return Math.sqrt(sum / buf.length);
    },
    close() {
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
      void context.close().catch(() => undefined);
    },
  };
}

/** Recursos de áudio realmente disponíveis neste navegador. */
export function audioCapabilities() {
  const s =
    typeof navigator !== "undefined" && navigator.mediaDevices?.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints()
      : ({} as MediaTrackSupportedConstraints);
  return {
    echoCancellation: Boolean(s.echoCancellation),
    noiseSuppression: Boolean(s.noiseSuppression),
    autoGainControl: Boolean(s.autoGainControl),
  };
}
