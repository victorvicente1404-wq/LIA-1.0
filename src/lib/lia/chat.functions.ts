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
    const systemFinal = data.system + contextoTemporal;

    // 1) Provedor principal: IA do Lovable (com as ferramentas dos serviços conectados).
    try {
      if (!key) throw new Error("LOVABLE_API_KEY ausente");
      const gateway = createLovableAiGatewayProvider(key);
      const options = {
        model: gateway("google/gemini-3.7-flash"),
        system: systemFinal,
        messages,
        ...(Object.keys(tools).length ? { tools, stopWhen: stepCountIs(8) } : {}),
      } as Parameters<typeof generateText>[0];
      const result = await generateText(options);
      const text =
        result.text.trim() ||
        "Fiz o que você pediu nos seus serviços, mas não consegui montar um resumo agora.";
      return { ok: true as const, text };
    } catch (error) {
      const status =
        (error as { statusCode?: number; status?: number }).statusCode ??
        (error as { status?: number }).status;
      // Log interno apenas — nada sensível vai para o usuário.
      console.error("Provedor principal falhou:", status ?? "sem status", (error as Error).message);

      // Requisição inválida (400/401): trocar de modelo não resolve.
      const recuperavel = status !== 400 && status !== 401;

      if (recuperavel) {
        // 2) Fallback: Gemini oficial, com o MESMO system prompt, memórias e histórico.
        try {
          const { generateWithGemini } = await import("./gemini.server");
          const text = await generateWithGemini(
            systemFinal,
            messages as Array<{ role: "user" | "assistant"; content: string | Record<string, unknown>[] }>,
          );
          return { ok: true as const, text, provider: "gemini" as const };
        } catch (geminiError) {
          console.error("Fallback Gemini falhou:", (geminiError as Error).message);
        }

        // 3) Último recurso: busca pública com a última pergunta do usuário.
        try {
          const { searchFallback } = await import("./gemini.server");
          const last = [...data.messages].reverse().find((m) => m.role === "user");
          const found = last ? await searchFallback(last.content) : null;
          if (found) return { ok: true as const, text: found, provider: "busca" as const };
        } catch (searchError) {
          console.error("Fallback de busca falhou:", (searchError as Error).message);
        }
      }

      const message =
        status === 400 || status === 401
          ? "Não consegui entender essa solicitação. Pode tentar reformular?"
          : "Estou temporariamente indisponível. Sua conversa e suas memórias estão salvas — tente de novo em alguns instantes.";
      return { ok: false as const, text: message, status: status ?? 500 };
    }

  });
