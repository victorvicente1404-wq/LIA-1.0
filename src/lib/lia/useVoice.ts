/**
 * Hook de voz da Lia.
 *
 * - Reconhecimento contínuo (Web Speech) em pt-BR com reinício automático.
 * - Palavra de ativação ("Lia"): em modo "sleeping" só age ao ouvir a palavra;
 *   o texto seguinte vira a primeira pergunta. Após responder, volta a dormir.
 * - Monitor de áudio (getUserMedia + AnalyserNode) com redução de ruído:
 *   alimenta o medidor de nível e interrompe a fala da Lia de forma confiável
 *   (vários frames acima do limiar), em vez de depender só do onspeechstart.
 * - Escuta contínua: o microfone permanece ativo até o usuário desligar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { matchWakeWord } from "./wake-word";
import { createAudioMonitor, type AudioMonitor } from "./audio";
import { speak as ttsSpeak, cancelSpeech } from "./tts";

export type MicState = "off" | "sleeping" | "active" | "hearing" | "processing" | "speaking";

export interface UseVoiceOptions {
  wakeWord?: boolean;
  wakeWordName?: string;
  sensibilidade?: number;
  silencioMs?: number;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getRecognitionCtor(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null
  );
}

export function useVoice(
  onTranscript: (text: string) => void,
  options: UseVoiceOptions = {},
) {
  const {
    wakeWord = false,
    wakeWordName = "lia",
    sensibilidade = 60,
    silencioMs = 1200,
  } = options;

  const [micOn, setMicOn] = useState(false);
  const [micState, setMicState] = useState<MicState>("off");
  const [hearing, setHearing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const [supported] = useState(() => {
    if (typeof window === "undefined") return { mic: false, tts: false };
    return {
      mic: !!getRecognitionCtor(),
      tts: "speechSynthesis" in window,
    };
  });

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const buildRecognitionRef = useRef<(() => SpeechRecognitionLike | null) | null>(null);
  const monitorRef = useRef<AudioMonitor | null>(null);
  const wakeActiveRef = useRef(false); // acordada pela palavra de ativação
  const speakingRef = useRef(false);
  const micOnRef = useRef(false);
  const speakStartRef = useRef(0);
  const wantListeningRef = useRef(false); // intent de manter reconhecimento ativo
  const optsRef = useRef({ wakeWord, wakeWordName, onTranscript });
  optsRef.current = { wakeWord, wakeWordName, onTranscript };

  const updateState = useCallback(() => {
    if (!micOnRef.current) {
      setMicState("off");
      setHearing(false);
      return;
    }
    if (speakingRef.current) {
      setMicState("speaking");
      setHearing(false);
      return;
    }
    if (wakeActiveRef.current || !optsRef.current.wakeWord) {
      setMicState("hearing");
      setHearing(true);
    } else {
      setMicState("sleeping");
      setHearing(false);
    }
  }, []);

  const ensureMonitor = useCallback(() => {
    if (monitorRef.current || typeof window === "undefined") return;
    const mon = createAudioMonitor(sensibilidade, silencioMs, {
      onLevel: (l) => setAudioLevel(l),
      onVoice: (v) => {
        // Interrompe a fala da Lia quando o usuário começa a falar.
        // Ignora o começo da fala (eco da própria voz da Lia no microfone).
        if (v && speakingRef.current && Date.now() - speakStartRef.current > 1500) {
          cancelSpeech();
          speakingRef.current = false;
          setSpeaking(false);
          updateState();
        }
      },
    });
    monitorRef.current = mon;
    mon.start().catch(() => {
      /* permissão negada — o reconhecimento ainda funciona sem nível */
    });
  }, [sensibilidade, silencioMs, updateState]);

  const buildRecognition = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "pt-BR";
    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
      }
      if (!finalText) return;
      if (speakingRef.current) return; // ignora enquanto a própria Lia fala
      const { wakeWord: ww, wakeWordName: wn, onTranscript: cb } = optsRef.current;
      if (ww && !wakeActiveRef.current) {
        const m = matchWakeWord(finalText, wn);
        if (m.matched) {
          wakeActiveRef.current = true;
          updateState();
          if (m.query.trim()) cb(m.query.trim());
        }
        return;
      }
      const t = finalText.trim();
      if (t) {
        if (ww) wakeActiveRef.current = true;
        cb(t);
      }
    };
    rec.onerror = (e: any) => {
      const err = e?.error as string | undefined;
      if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
        // Sem permissão de microfone: desliga em vez de entrar em loop.
        wantListeningRef.current = false;
        micOnRef.current = false;
        setMicOn(false);
        updateState();
      }
    };
    rec.onend = () => {
      // Reinício automático com pequeno atraso (Chrome rejeita start imediato).
      if (!wantListeningRef.current) return;
      setTimeout(() => {
        if (!wantListeningRef.current || recRef.current !== rec) return;
        try {
          rec.start();
        } catch {
          const fresh = buildRecognitionRef.current?.();
          recRef.current = fresh ?? null;
          try {
            fresh?.start();
          } catch {
            /* noop */
          }
        }
      }, 250);
    };
    return rec;
  }, [updateState]);
  buildRecognitionRef.current = buildRecognition;

  const startListening = useCallback(() => {
    if (!supported.mic) return;
    micOnRef.current = true;
    wantListeningRef.current = true;
    setMicOn(true);
    if (optsRef.current.wakeWord) wakeActiveRef.current = false;
    ensureMonitor();
    if (!recRef.current) recRef.current = buildRecognition();
    const rec = recRef.current;
    if (rec) {
      try {
        rec.start();
      } catch {
        /* já iniciado */
      }
    }
    updateState();
  }, [supported.mic, ensureMonitor, buildRecognition, updateState]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    micOnRef.current = false;
    setMicOn(false);
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {
        /* noop */
      }
    }
    if (monitorRef.current) {
      monitorRef.current.stop();
      monitorRef.current = null;
    }
    setAudioLevel(0);
    wakeActiveRef.current = false;
    updateState();
  }, [updateState]);

  const shutUp = useCallback(() => {
    cancelSpeech();
    speakingRef.current = false;
    setSpeaking(false);
    updateState();
  }, [updateState]);

  const speak = useCallback(
    (text: string, opts?: { velocidade?: number; tom?: number }) => {
      if (!supported.tts) return;
      cancelSpeech();
      speakingRef.current = true;
      speakStartRef.current = Date.now();
      setSpeaking(true);
      updateState();
      const ttsOpts: import("./tts").TtsSpeakOptions = {
        onEnd: () => {
          speakingRef.current = false;
          setSpeaking(false);
          // Volta a dormir após responder, se a palavra de ativação estiver ligada.
          if (optsRef.current.wakeWord) wakeActiveRef.current = false;
          updateState();
          // Retoma a escuta contínua.
          if (wantListeningRef.current && recRef.current && !speakingRef.current) {
            try {
              recRef.current.start();
            } catch {
              /* já iniciado */
            }
          }
        },
      };
      if (opts?.velocidade !== undefined) ttsOpts.velocidade = opts.velocidade;
      if (opts?.tom !== undefined) ttsOpts.tom = opts.tom;
      ttsSpeak(text, ttsOpts);
    },
    [supported.tts, updateState],
  );

  const resumeAfterResponse = useCallback(() => {
    if (!wantListeningRef.current) return;
    if (optsRef.current.wakeWord) wakeActiveRef.current = false;
    ensureMonitor();
    if (!recRef.current) recRef.current = buildRecognition();
    const rec = recRef.current;
    if (rec) {
      try {
        rec.start();
      } catch {
        /* já iniciado */
      }
    }
    updateState();
  }, [ensureMonitor, buildRecognition, updateState]);

  // Reinicia quando as opções de wake word mudam.
  useEffect(() => {
    if (micOnRef.current) {
      wakeActiveRef.current = false;
      updateState();
    }
  }, [wakeWord, updateState]);

  // Limpeza ao desmontar.
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (recRef.current) {
        try {
          recRef.current.abort();
        } catch {
          /* noop */
        }
      }
      if (monitorRef.current) monitorRef.current.stop();
    };
  }, []);

  return {
    micOn,
    micState,
    hearing,
    speaking,
    audioLevel,
    supported,
    startListening,
    stopListening,
    speak,
    shutUp,
    resumeAfterResponse,
  };
}
