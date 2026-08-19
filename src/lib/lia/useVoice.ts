/**
 * Módulo de Voz — escuta (SpeechRecognition) e fala (SpeechSynthesis).
 * Tudo roda localmente no navegador. Preparado para interrupção imediata.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function useVoice(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState({ mic: false, tts: false });
  const recRef = useRef<Recognition | null>(null);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSupported({ mic: Boolean(Ctor), tts: "speechSynthesis" in window });
    if (!Ctor) return;
    const rec: Recognition = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript as string | undefined;
      if (text) cbRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => rec.stop();
  }, []);

  const startListening = useCallback(() => {
    // Nova entrada do usuário interrompe imediatamente a fala da Lia.
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    try {
      recRef.current?.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = 1;
    u.pitch = 1.05;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.startsWith("pt") && /female|luciana|maria|fernanda/i.test(v.name));
    if (voice) u.voice = voice;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  const shutUp = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { listening, speaking, supported, startListening, stopListening, speak, shutUp };
}
