/**
 * Módulo de Voz — escuta contínua (SpeechRecognition) e fala (motor TTS).
 *
 * Reconhecimento de voz e síntese são camadas separadas e substituíveis:
 * este hook apenas orquestra os dois e o estado da conversa falada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserTts } from "./tts";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onspeechstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

export type MicState = "off" | "active" | "hearing" | "processing";

export function useVoice(onTranscript: (text: string) => void) {
  const [micState, setMicState] = useState<MicState>("off");
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState({ mic: false, tts: false });
  const [erro, setErro] = useState<string | null>(null);

  const recRef = useRef<Recognition | null>(null);
  const wantedRef = useRef(false); // usuário quer o microfone ligado
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;
  const tts = useMemo(() => createBrowserTts(), []);
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  const shutUp = useCallback(() => {
    ttsRef.current.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSupported({ mic: Boolean(Ctor), tts: ttsRef.current.supported });
    if (!Ctor) return;

    const rec: Recognition = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true; // sessão longa: não desliga após uma frase
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onspeechstart = () => {
      // Usuário começou a falar: a Lia se cala imediatamente.
      ttsRef.current.cancel();
      setSpeaking(false);
      setMicState("hearing");
    };

    rec.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0]?.transcript ?? "";
        else setMicState("hearing");
      }
      const text = final.trim();
      if (text) {
        setMicState("processing");
        cbRef.current(text);
      }
    };

    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        wantedRef.current = false;
        setErro("Microfone sem permissão do navegador.");
        setMicState("off");
      }
    };

    // Reinício automático mantém a escuta viva enquanto o usuário quiser.
    rec.onend = () => {
      if (!wantedRef.current) {
        setMicState("off");
        return;
      }
      try {
        rec.start();
        setMicState("active");
      } catch {
        setTimeout(() => {
          if (!wantedRef.current) return;
          try {
            rec.start();
            setMicState("active");
          } catch {
            setMicState("off");
          }
        }, 400);
      }
    };

    recRef.current = rec;
    return () => {
      wantedRef.current = false;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const startListening = useCallback(() => {
    setErro(null);
    ttsRef.current.cancel();
    setSpeaking(false);
    wantedRef.current = true;
    try {
      recRef.current?.start();
      setMicState("active");
    } catch {
      setMicState("active"); // já estava rodando
    }
  }, []);

  const stopListening = useCallback(() => {
    wantedRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setMicState("off");
  }, []);

  const speak = useCallback((text: string, opts?: { velocidade?: number; tom?: number }) => {
    ttsRef.current.speak(text, {
      ...opts,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }, []);

  /** Sinaliza que o processamento terminou e o microfone volta a escutar. */
  const resumeAfterResponse = useCallback(() => {
    setMicState((s) => (wantedRef.current ? (s === "off" ? "active" : "active") : "off"));
  }, []);

  return {
    micState,
    micOn: micState !== "off",
    listening: micState === "hearing" || micState === "active",
    hearing: micState === "hearing",
    speaking,
    supported,
    erro,
    startListening,
    stopListening,
    resumeAfterResponse,
    speak,
    shutUp,
  };
}
