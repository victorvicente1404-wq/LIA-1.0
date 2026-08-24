/**
 * VoiceController — máquina de estados da entrada de voz da Lia.
 *
 *   off → passive → waking → listening → processing → speaking → passive
 *
 * Regras centrais:
 *  - Em escuta passiva nada é interpretado nem enviado à Lia: o texto captado
 *    é descartado até a wake word aparecer.
 *  - Enquanto a Lia fala, a própria voz dela nunca é tratada como comando
 *    (portão de estado + cancelamento de eco). Só a wake word interrompe.
 *  - A janela de escuta ativa fecha sozinha por silêncio ou tempo.
 */
import { openAudioSession, type AudioSession } from "./audio-processor";
import { createRecognition, recognitionSupported, type RecognitionSession } from "./recognition";
import { startVad, type Vad } from "./vad";
import { createBrowserTranscription } from "./transcription";
import { createBrowserWakeWord } from "./wakeword/browser";
import { createPorcupineWakeWord, porcupineAvailable } from "./wakeword/porcupine";
import { stripWakeWord } from "./wakeword/match";
import { defaultVoiceSettings, type VoicePhase, type VoiceSettings, type WakeWordEngine } from "./types";

export interface VoiceControllerEvents {
  onPhase: (phase: VoicePhase) => void;
  /** Comando pronto para o núcleo da Lia. */
  onCommand: (text: string) => void;
  /** Wake word sem comando na mesma frase — a Lia responde "Sim?". */
  onWakeOnly: () => void;
  /** Usuário interrompeu a fala da Lia. */
  onInterrupt: () => void;
  onError: (message: string) => void;
  onEngine: (info: { id: string; label: string; onDevice: boolean }) => void;
  onLevel?: (level: number) => void;
}

export class VoiceController {
  private phase: VoicePhase = "off";
  private audio: AudioSession | null = null;
  private vad: Vad | null = null;
  private recognition: RecognitionSession | null = null;
  private wake: WakeWordEngine | null = null;
  private browserWake: ReturnType<typeof createBrowserWakeWord> | null = null;
  private transcription: ReturnType<typeof createBrowserTranscription> | null = null;
  private settings: VoiceSettings = defaultVoiceSettings;
  private ttsSpeaking = false;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private starting = false;

  constructor(private events: VoiceControllerEvents) {}

  get currentPhase() {
    return this.phase;
  }

  static supported() {
    return recognitionSupported();
  }

  updateSettings(next: VoiceSettings) {
    const modeChanged = next.modo !== this.settings.modo;
    this.settings = next;
    if (this.phase === "off") return;
    if (modeChanged) this.enterIdleState();
  }

  /** Liga o microfone. */
  async start(settings: VoiceSettings) {
    this.settings = settings;
    if (this.starting || this.phase !== "off") return;
    this.starting = true;
    try {
      this.audio = await openAudioSession();
    } catch {
      this.starting = false;
      this.events.onError("Microfone sem permissão do navegador.");
      return;
    }

    this.recognition = createRecognition();
    if (!this.recognition) {
      this.events.onError("Este navegador não suporta reconhecimento de fala.");
      this.audio.close();
      this.audio = null;
      this.starting = false;
      return;
    }

    this.transcription = createBrowserTranscription(this.recognition);
    this.transcription.onChunk((chunk) => this.handleCommandChunk(chunk.text, chunk.final));

    // Motor de wake word: on-device quando disponível, senão navegador.
    const onDevice = (await porcupineAvailable())
      ? await createPorcupineWakeWord(this.settings.wakeWord)
      : null;
    if (onDevice) {
      this.wake = onDevice;
    } else {
      this.browserWake = createBrowserWakeWord(this.recognition, () => this.settings.wakeWord);
      this.wake = this.browserWake;
    }
    this.wake.onDetect((d) => this.handleWake(d.command, d.final));
    this.events.onEngine({ id: this.wake.id, label: this.wake.label, onDevice: this.wake.onDevice });

    this.recognition.onError((code) => {
      if (code === "not-allowed" || code === "service-not-allowed") {
        this.events.onError("Microfone sem permissão do navegador.");
        void this.stop();
      }
    });
    this.recognition.onChunk((chunk) => {
      // A wake word de fallback vê tudo; a transcrição só recebe o que passar
      // pelo portão de estado.
      this.browserWake?.feed(chunk.text, chunk.final);
      if (this.isActiveWindow()) this.transcription?.feed(chunk);
    });

    this.vad = startVad(this.audio, {
      onLevel: this.events.onLevel,
      onSpeechStart: () => {
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        if (this.isActiveWindow()) this.armWindow();
      },
      onSpeechEnd: () => {
        if (this.isActiveWindow()) this.armSilence();
      },
    });

    this.starting = false;
    this.enterIdleState();
  }

  /** Desliga o microfone e libera tudo. */
  async stop() {
    this.clearTimers();
    this.wake?.stop();
    this.transcription?.stop();
    this.recognition?.stop();
    this.recognition?.destroy();
    this.vad?.stop();
    this.audio?.close();
    this.wake = null;
    this.browserWake = null;
    this.transcription = null;
    this.recognition = null;
    this.vad = null;
    this.audio = null;
    this.setPhase("off");
  }

  /** Informa que o motor de fala da Lia começou/terminou. */
  setSpeaking(speaking: boolean) {
    this.ttsSpeaking = speaking;
    if (this.phase === "off") return;
    if (speaking) {
      this.clearTimers();
      this.setPhase("speaking");
    } else if (this.phase === "speaking") {
      this.enterIdleState();
    }
  }

  /** Informa que a Lia está processando o comando. */
  setProcessing(processing: boolean) {
    if (this.phase === "off") return;
    if (processing) {
      this.clearTimers();
      this.setPhase("processing");
    } else if (this.phase === "processing" && !this.ttsSpeaking) {
      this.enterIdleState();
    }
  }

  // ---------- interno ----------

  private setPhase(phase: VoicePhase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.events.onPhase(phase);
  }

  /** Estado de repouso do microfone: passivo (wake word) ou escuta contínua. */
  private enterIdleState() {
    this.clearTimers();
    if (!this.audio) return;
    const wakeMode = this.settings.modo === "wake" && this.settings.wakeWordAtiva;
    if (wakeMode) {
      this.transcription?.stop();
      void this.wake?.start(this.audio.stream);
      if (this.settings.escutaPassiva || !this.wake?.onDevice) this.recognition?.start();
      this.setPhase("passive");
    } else {
      // Escuta contínua: VAD separa as falas, mas o portão anti-eco continua.
      void this.wake?.start(this.audio.stream);
      this.transcription?.start();
      this.recognition?.start();
      this.setPhase("listening");
      this.armWindow(0);
    }
  }

  private isActiveWindow() {
    if (this.ttsSpeaking) return false;
    if (this.settings.modo === "continuous") return this.phase === "listening";
    return this.phase === "listening" || this.phase === "waking";
  }

  private armWindow(seconds = this.settings.janelaEscuta) {
    if (this.windowTimer) clearTimeout(this.windowTimer);
    if (this.settings.modo === "continuous" || seconds <= 0) return;
    this.windowTimer = setTimeout(() => this.enterIdleState(), seconds * 1000);
  }

  private armSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.settings.modo === "continuous") return;
    this.silenceTimer = setTimeout(() => {
      if (this.phase === "listening" || this.phase === "waking") this.enterIdleState();
    }, 3000);
  }

  private handleWake(command: string, final: boolean) {
    if (this.phase === "off") return;

    // Interrupção: a Lia se cala assim que é chamada.
    if (this.ttsSpeaking || this.phase === "speaking") {
      this.events.onInterrupt();
      this.ttsSpeaking = false;
    }

    if (this.phase !== "listening") this.setPhase("waking");
    this.transcription?.start();
    this.recognition?.start();
    this.armWindow();

    if (!final) {
      this.setPhase("listening");
      return;
    }

    const cmd = command.trim();
    if (cmd.length >= 2) {
      this.dispatch(cmd);
    } else {
      this.setPhase("listening");
      this.events.onWakeOnly();
      this.armWindow();
    }
  }

  private handleCommandChunk(text: string, final: boolean) {
    if (!this.isActiveWindow()) return;
    if (!final) {
      this.setPhase("listening");
      this.armWindow();
      return;
    }
    const clean = stripWakeWord(text, this.settings.wakeWord);
    if (clean.length >= 2) this.dispatch(clean);
  }

  private dispatch(text: string) {
    this.clearTimers();
    this.transcription?.stop();
    this.setPhase("processing");
    this.events.onCommand(text);
  }

  private clearTimers() {
    if (this.windowTimer) clearTimeout(this.windowTimer);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.windowTimer = null;
    this.silenceTimer = null;
  }
}
