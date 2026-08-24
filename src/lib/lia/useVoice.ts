/**
 * Módulo de Voz — camada fina sobre o VoiceController (wake word + escuta)
 * e o motor de fala (TTS).
 *
 * A Lia não interpreta tudo o que ouve: em escuta passiva ela apenas espera
 * ser chamada pela wake word.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserTts } from "./tts";
import { VoiceController } from "./voice/controller";
import { defaultVoiceSettings, type VoicePhase, type VoiceSettings } from "./voice/types";

export type { VoicePhase, VoiceSettings };

export interface EngineInfo {
  id: string;
  label: string;
  onDevice: boolean;
}

export function useVoice(
  onTranscript: (text: string) => void,
  options?: { settings?: VoiceSettings; onWakeOnly?: () => void },
) {
  const settings = options?.settings ?? defaultVoiceSettings;
  const [phase, setPhase] = useState<VoicePhase>("off");
  const [speaking, setSpeaking] = useState(false);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [supported, setSupported] = useState({ mic: false, tts: false });

  const tts = useMemo(() => createBrowserTts(), []);
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;
  const wakeOnlyRef = useRef(options?.onWakeOnly);
  wakeOnlyRef.current = options?.onWakeOnly;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const controllerRef = useRef<VoiceController | null>(null);

  const shutUp = useCallback(() => {
    ttsRef.current.cancel();
    setSpeaking(false);
    controllerRef.current?.setSpeaking(false);
  }, []);

  if (!controllerRef.current && typeof window !== "undefined") {
    controllerRef.current = new VoiceController({
      onPhase: setPhase,
      onCommand: (text) => cbRef.current(text),
      onWakeOnly: () => wakeOnlyRef.current?.(),
      onInterrupt: () => {
        ttsRef.current.cancel();
        setSpeaking(false);
      },
      onError: (message) => setErro(message),
      onEngine: (info) => setEngine(info),
    });
  }

  useEffect(() => {
    setSupported({ mic: VoiceController.supported(), tts: ttsRef.current.supported });
    return () => {
      void controllerRef.current?.stop();
    };
  }, []);

  // Mudanças de configuração (modo, wake word, janela) valem na hora.
  useEffect(() => {
    controllerRef.current?.updateSettings(settings);
  }, [settings.modo, settings.wakeWord, settings.wakeWordAtiva, settings.escutaPassiva, settings.janelaEscuta, settings.identificacaoVoz]);

  const startListening = useCallback(() => {
    setErro(null);
    void controllerRef.current?.start(settingsRef.current);
  }, []);

  const stopListening = useCallback(() => {
    void controllerRef.current?.stop();
  }, []);

  const speak = useCallback((text: string, opts?: { velocidade?: number; tom?: number }) => {
    controllerRef.current?.setSpeaking(true);
    ttsRef.current.speak(text, {
      ...opts,
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false);
        controllerRef.current?.setSpeaking(false);
      },
    });
  }, []);

  /** Informa o fim (ou início) do processamento do comando. */
  const setProcessing = useCallback((processing: boolean) => {
    controllerRef.current?.setProcessing(processing);
  }, []);

  return {
    phase,
    micOn: phase !== "off",
    passive: phase === "passive",
    waking: phase === "waking",
    listening: phase === "listening" || phase === "waking",
    hearing: phase === "listening",
    speaking,
    engine,
    supported,
    erro,
    startListening,
    stopListening,
    setProcessing,
    speak,
    shutUp,
  };
}
