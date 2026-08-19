import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const Input = z.object({
  system: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(40),
});

/** Fala da Lia: uma chamada de conversação ao Lovable AI. */
export const liaRespond = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const gateway = createLovableAiGatewayProvider(key);

    try {
      const result = await generateText({
        model: gateway("google/gemini-3.7-flash"),
        system: data.system,
        messages: data.messages,
      });
      return { ok: true as const, text: result.text };
    } catch (error) {
      const status = (error as { statusCode?: number; status?: number }).statusCode ??
        (error as { status?: number }).status;
      const message =
        status === 402
          ? "Os créditos de IA do espaço de trabalho acabaram. Adicione créditos em Lovable para eu voltar a conversar."
          : status === 429
            ? "Muitas mensagens em pouco tempo. Aguarde alguns segundos e fale comigo de novo."
            : status === 403
              ? "O acesso à IA está bloqueado pelas políticas do espaço de trabalho."
              : `Não consegui responder agora: ${(error as Error).message}`;
      return { ok: false as const, text: message, status: status ?? 500 };
    }
  });
