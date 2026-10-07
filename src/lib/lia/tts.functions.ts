/**
 * Síntese de voz da Lia via ElevenLabs (somente no servidor).
 * A chave ELEVENLABS_API_KEY vem do conector e nunca vai ao navegador.
 */
import { createServerFn } from "@tanstack/react-start";

/** Voz feminina padrão da Lia (Jessica — jovem, alegre e brincalhona). */
export const LIA_VOICE_ID = "cgSgspJ2msm6clMCkdW9";

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; voiceId?: string }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) throw new Error("ElevenLabs não está conectado a este projeto");

    const text = (data.text ?? "").trim().slice(0, 4500);
    if (!text) throw new Error("Texto vazio");

    const voiceId = data.voiceId?.trim() || LIA_VOICE_ID;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.32,
            similarity_boost: 0.8,
            style: 0.55,
            use_speaker_boost: true,
            speed: 1.06,
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`ElevenLabs TTS falhou [${res.status}]: ${body}`);
      throw new Error(`ElevenLabs TTS falhou: ${res.status}`);
    }

    const buf = await res.arrayBuffer();
    return { audio: `data:audio/mpeg;base64,${toBase64(buf)}` };
  });
