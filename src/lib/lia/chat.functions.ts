import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CustomApiSchema } from "./custom-apis";
import { IotSchema } from "./iot";

const Input = z.object({
  system: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(40),
  /** Frame atual da câmera (data URL JPEG), quando o módulo de visão está ativo. */
  frame: z.string().startsWith("data:image/").max(4_500_000).optional(),
  /** Anexos enviados pelo usuário nesta mensagem. */
  attachments: z
    .array(
      z.object({
        name: z.string().max(200),
        mime: z.string().max(120),
        /** Imagens vêm como data URL; documentos vêm como texto extraído. */
        dataUrl: z.string().max(5_500_000).optional(),
        text: z.string().max(400_000).optional(),
      }),
    )
    .max(6)
    .optional(),
  /** Credenciais da Evolution API (WhatsApp) salvas no navegador do usuário. */
  whatsapp: z
    .object({ url: z.string().url().max(300), apiKey: z.string().min(1).max(300), instance: z.string().min(1).max(80) })
    .optional(),
  /** Extensões dinâmicas do Lia Card (ferramentas e provedores reservas). */
  customApis: z.array(CustomApiSchema).max(40).optional(),
  /** Módulo IoT ativo: ponte HTTP do Arduino/ESP32. */
  iot: IotSchema.optional(),
  /** Arduino ligado por USB neste navegador (Web Serial). */
  usb: z.boolean().optional(),
  /** Outros aparelhos pareados pelo Lia Link. */
  remoteDevices: z.array(z.enum(["mobile", "desktop"])).max(2).optional(),
  /** Lia Agent (controle do computador) ligado; autonomo = sem confirmação prévia. */
  osAgent: z.object({ autonomo: z.boolean() }).optional(),
  /** App Android com o plugin LiaNative disponível. */
  nativeAndroid: z.boolean().optional(),
});

/**
 * Motor temporariamente isolado.
 * Não há provedores remotos, cascata, resposta de emergência nem modelo WebLLM.
 * A implementação do llama.cpp local será conectada aqui na próxima etapa.
 */
export const liaRespond = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async () => ({
    ok: false as const,
    text: "O motor de IA da Lia AI está desligado durante a preparação do modelo local. Nenhum modelo remoto ou fallback foi consultado. Assim que o llama.cpp estiver integrado, poderei responder novamente.",
    provider: "disabled" as const,
  }));
