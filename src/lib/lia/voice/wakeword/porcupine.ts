/**
 * Motor de wake word on-device (Picovoice Porcupine).
 *
 * Detecção 100% local: o áudio nunca sai do dispositivo.
 *
 * Requisitos (opcionais — sem eles o app usa o motor do navegador):
 *   1. `VITE_PICOVOICE_ACCESS_KEY` — chave gratuita do console Picovoice.
 *   2. `public/wakeword/lia.ppn` — palavra personalizada "Lia" gerada no
 *      console (Porcupine → Custom Wake Word → idioma Português → "Lia" →
 *      plataforma Web/WASM).
 *   3. `public/wakeword/porcupine_params_pt.pv` — modelo do idioma português.
 *   4. `bun add @picovoice/porcupine-web @picovoice/web-voice-processor`
 *
 * Os pacotes são importados dinamicamente: se não estiverem instalados, o
 * motor simplesmente se declara indisponível.
 */
import type { WakeWordDetection, WakeWordEngine } from "../types";

export const PORCUPINE_KEYWORD_URL = "/wakeword/lia.ppn";
export const PORCUPINE_MODEL_URL = "/wakeword/porcupine_params_pt.pv";

export function porcupineAccessKey(): string | null {
  const key = (import.meta.env as Record<string, string | undefined>)
    .VITE_PICOVOICE_ACCESS_KEY;
  return key && key.trim() ? key.trim() : null;
}

/** Confirma que a chave e os arquivos locais realmente existem. */
export async function porcupineAvailable(): Promise<boolean> {
  if (!porcupineAccessKey()) return false;
  try {
    const [kw, model] = await Promise.all([
      fetch(PORCUPINE_KEYWORD_URL, { method: "HEAD" }),
      fetch(PORCUPINE_MODEL_URL, { method: "HEAD" }),
    ]);
    return kw.ok && model.ok;
  } catch {
    return false;
  }
}

export async function createPorcupineWakeWord(
  label: string,
): Promise<WakeWordEngine | null> {
  const accessKey = porcupineAccessKey();
  if (!accessKey) return null;
  let worker: { release: () => Promise<void> } | null = null;
  let processor: any = null;
  let cb: (d: WakeWordDetection) => void = () => {};

  try {
    // Especificadores em variável: o bundler não exige o pacote instalado.
    const porcupineMod: any = await import(
      /* @vite-ignore */ "@picovoice/porcupine-web"
    );
    const wvpMod: any = await import(
      /* @vite-ignore */ "@picovoice/web-voice-processor"
    );
    const { PorcupineWorker } = porcupineMod;
    const { WebVoiceProcessor } = wvpMod;

    const created = await PorcupineWorker.create(
      accessKey,
      { publicPath: PORCUPINE_KEYWORD_URL, label },
      () => cb({ command: "", final: true }),
      { publicPath: PORCUPINE_MODEL_URL },
    );
    worker = created;
    processor = WebVoiceProcessor;

    return {
      id: "porcupine",
      onDevice: true,
      label: "Porcupine (no dispositivo)",
      async start() {
        await processor.subscribe(created);
      },
      stop() {
        void processor.unsubscribe(created).catch(() => undefined);
      },
      onDetect(next) {
        cb = next;
      },
    };
  } catch {
    await worker?.release().catch(() => undefined);
    return null;
  }
}
