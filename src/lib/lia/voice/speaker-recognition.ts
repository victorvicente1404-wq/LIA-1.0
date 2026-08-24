/**
 * SpeakerRecognition — identificação da voz do usuário.
 *
 * IMPORTANTE: não existe, no navegador, um verificador de locutor confiável
 * sem um provedor dedicado. Este módulo guarda o cadastro (enrollment) e
 * declara honestamente `available: false`: a Lia nunca afirma ter
 * identificado alguém. Basta trocar esta implementação por um provedor real
 * (ex.: modelo de embeddings de voz) para ativar o fluxo já previsto.
 */
import type { SpeakerProfile, SpeakerRecognizer } from "./types";

const KEY = "lia.speaker.profile.v1";

function read(): SpeakerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SpeakerProfile) : null;
  } catch {
    return null;
  }
}

export function createSpeakerRecognizer(): SpeakerRecognizer {
  return {
    id: "stub-local",
    available: false,
    unavailableReason:
      "A identificação de voz precisa de um provedor de reconhecimento de locutor. A arquitetura está pronta, mas nenhum motor real está conectado — então eu não afirmo reconhecer sua voz.",
    getProfile: read,
    async enroll(stream) {
      // Guarda apenas o registro de que houve cadastro (nenhum áudio é salvo).
      const amostras = stream.getAudioTracks().length;
      const profile: SpeakerProfile = { createdAt: Date.now(), amostras };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(profile));
      } catch {
        /* ignore */
      }
      return profile;
    },
    async verify() {
      return null; // sem provedor real: nunca simular identificação
    },
    clear() {
      try {
        window.localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    },
  };
}
