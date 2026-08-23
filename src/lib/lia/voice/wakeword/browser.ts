/**
 * Motor de wake word de fallback: usa o reconhecimento do navegador em modo
 * de baixa retenção. Nada é interpretado nem enviado à Lia enquanto a wake
 * word não aparecer — o texto captado é descartado imediatamente.
 *
 * Limite de privacidade: no Chrome, o áudio é processado nos servidores da
 * Google. A tela de Privacidade informa isso ao usuário.
 */
import type { RecognitionSession } from "../recognition";
import type { WakeWordDetection, WakeWordEngine } from "../types";
import { matchWakeWord } from "./match";

export function createBrowserWakeWord(
  recognition: RecognitionSession,
  getWord: () => string,
): WakeWordEngine {
  let cb: (d: WakeWordDetection) => void = () => {};
  let active = false;

  // O consumo dos chunks é feito pelo controller, que encaminha para cá.
  const feed = (text: string, final: boolean) => {
    if (!active) return;
    const m = matchWakeWord(text, getWord());
    if (m.matched) cb({ command: m.command, final });
  };

  const engine: WakeWordEngine & { feed: typeof feed } = {
    id: "browser-speech",
    onDevice: false,
    label: "Reconhecimento do navegador",
    async start() {
      active = true;
      recognition.start();
    },
    stop() {
      active = false;
    },
    onDetect(next) {
      cb = next;
    },
    feed,
  };
  return engine;
}

export type BrowserWakeWord = ReturnType<typeof createBrowserWakeWord> & {
  feed: (text: string, final: boolean) => void;
};
