/**
 * Transcrição (fala → texto). Hoje o provedor é o reconhecimento do
 * navegador; a interface permite plugar um serviço externo depois.
 */
import type { RecognitionSession } from "./recognition";
import type { SpeechChunk, TranscriptionEngine } from "./types";

export function createBrowserTranscription(
  recognition: RecognitionSession,
): TranscriptionEngine & { feed: (c: SpeechChunk) => void } {
  let cb: (c: SpeechChunk) => void = () => {};
  let active = false;

  return {
    id: "browser-speech",
    start() {
      active = true;
      recognition.start();
    },
    stop() {
      active = false;
    },
    onChunk(next) {
      cb = next;
    },
    feed(chunk) {
      if (active) cb(chunk);
    },
  };
}
