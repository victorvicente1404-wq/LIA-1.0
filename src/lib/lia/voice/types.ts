/**
 * Camada de voz da Lia — contratos dos módulos.
 *
 *   Voz
 *   ├── WakeWord          detecção de "Lia"
 *   ├── VAD               início/fim da fala
 *   ├── AudioProcessor    ruído / eco / ganho
 *   ├── SpeakerRecognition identificação da voz
 *   ├── Transcription     fala → texto
 *   └── VoiceController   estados da Lia
 *
 * Cada provedor é substituível: basta implementar a interface.
 */

export type VoicePhase =
  | "off" // microfone desligado
  | "passive" // escuta passiva: só procura a wake word
  | "waking" // wake word detectada
  | "listening" // janela de escuta ativa
  | "processing" // comando enviado ao núcleo da Lia
  | "speaking"; // Lia falando (entrada ignorada, exceto interrupção)

export type VoiceMode = "wake" | "continuous";

export interface VoiceSettings {
  modo: VoiceMode;
  wakeWord: string;
  wakeWordAtiva: boolean;
  escutaPassiva: boolean;
  /** Duração da janela de escuta ativa, em segundos. */
  janelaEscuta: number;
  identificacaoVoz: boolean;
}

export const defaultVoiceSettings: VoiceSettings = {
  modo: "wake",
  wakeWord: "Lia",
  wakeWordAtiva: true,
  escutaPassiva: true,
  janelaEscuta: 8,
  identificacaoVoz: false,
};

/** Resultado bruto de um motor de reconhecimento de fala. */
export interface SpeechChunk {
  text: string;
  final: boolean;
}

export interface WakeWordDetection {
  /** Texto que veio depois da wake word na mesma frase (pode ser vazio). */
  command: string;
  final: boolean;
}

export interface WakeWordEngine {
  readonly id: string;
  /** Verdadeiro quando a detecção acontece no próprio dispositivo. */
  readonly onDevice: boolean;
  readonly label: string;
  start: (stream: MediaStream) => Promise<void>;
  stop: () => void;
  onDetect: (cb: (d: WakeWordDetection) => void) => void;
}

export interface TranscriptionEngine {
  readonly id: string;
  start: () => void;
  stop: () => void;
  onChunk: (cb: (c: SpeechChunk) => void) => void;
}

export interface SpeakerProfile {
  createdAt: number;
  amostras: number;
}

export interface SpeakerRecognizer {
  readonly id: string;
  /** Falso enquanto não houver provedor real — a UI mostra isso honestamente. */
  readonly available: boolean;
  readonly unavailableReason: string;
  getProfile: () => SpeakerProfile | null;
  enroll: (stream: MediaStream) => Promise<SpeakerProfile>;
  verify: (stream: MediaStream) => Promise<{ match: boolean; confidence: number } | null>;
  clear: () => void;
}
