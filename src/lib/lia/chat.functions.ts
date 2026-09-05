import { createServerFn } from "@tanstack/react-start";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const Input = z.object({
  system: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(40),
  /** Frame atual da câmera (data URL JPEG), quando o módulo de visão está ativo. */
  frame: z.string().startsWith("data:image/").max(4_000_000).optional(),
  /** Anexos enviados pelo usuário nesta mensagem. */
  attachments: z
    .array(
      z.object({
        name: z.string().max(200),
        mime: z.string().max(120),
        /** Imagens vêm como data URL; documentos vêm como texto extraído. */
        dataUrl: z.string().max(6_000_000).optional(),
        text: z.string().max(400_000).optional(),
      }),
    )
    .max(6)
    .optional(),
});

/** Fala da Lia: conversação, visão e ações nos serviços conectados. */
export const liaRespond = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const gateway = createLovableAiGatewayProvider(key);

    // O último turno do usuário carrega o frame da câmera e os anexos, quando existem.
    const anexos = data.attachments ?? [];
    const messages = data.messages.map((m, i) => {
      const isLastUser = i === data.messages.length - 1 && m.role === "user";
      if (!isLastUser || (!data.frame && !anexos.length)) return m;
      const parts: Array<Record<string, unknown>> = [{ type: "text", text: m.content }];
      if (data.frame) parts.push({ type: "image", image: data.frame });
      for (const a of anexos) {
        if (a.dataUrl && a.mime.startsWith("image/")) {
          parts.push({ type: "image", image: a.dataUrl });
        } else if (a.dataUrl && a.mime === "application/pdf") {
          parts.push({ type: "file", mediaType: a.mime, data: a.dataUrl, filename: a.name });
        } else if (a.text) {
          parts.push({ type: "text", text: `Arquivo anexado "${a.name}":\n${a.text}` });
        }
      }
      return { role: "user" as const, content: parts };
    });

    // Ferramentas dos serviços conectados (só para usuário autenticado).
    let tools: Record<string, unknown> = {};
    try {
      const { resolveOptionalUserId } = await import("@/server/optionalAuth.server");
      const userId = await resolveOptionalUserId();
      if (userId) {
        const { buildLiaTools } = await import("@/server/liaTools.server");
        tools = (await buildLiaTools(userId)).tools;
      }
    } catch (error) {
      console.error("Falha ao preparar as ferramentas da Lia:", (error as Error).message);
    }

    const agora = new Date();
    const contextoTemporal = `\n\nAGORA: ${agora.toISOString()} (fuso do usuário: America/Sao_Paulo).`;

    try {
      const options = {
        model: gateway("google/gemini-3.7-flash"),
        system: data.system + contextoTemporal,
        messages,
        ...(Object.keys(tools).length ? { tools, stopWhen: stepCountIs(8) } : {}),
      } as Parameters<typeof generateText>[0];
      const result = await generateText(options);
      const text =
        result.text.trim() ||
        "Fiz o que você pediu nos seus serviços, mas não consegui montar um resumo agora.";
      return { ok: true as const, text };
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
