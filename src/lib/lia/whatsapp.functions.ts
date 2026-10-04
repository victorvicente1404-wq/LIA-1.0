import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const EvolutionConfigSchema = z.object({
  url: z.string().url().max(300),
  apiKey: z.string().min(1).max(300),
  instance: z.string().min(1).max(80),
});

export const waTest = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ cfg: EvolutionConfigSchema }).parse(i))
  .handler(async ({ data }) => {
    const { testConnection } = await import("./whatsapp.server");
    return testConnection(data.cfg);
  });

export const waSend = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({ cfg: EvolutionConfigSchema, to: z.string().min(3).max(80), text: z.string().min(1).max(4000) })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { sendMessage } = await import("./whatsapp.server");
    return sendMessage(data.cfg, data.to, data.text);
  });

export const waChats = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ cfg: EvolutionConfigSchema }).parse(i))
  .handler(async ({ data }) => {
    const { getChats } = await import("./whatsapp.server");
    return getChats(data.cfg);
  });

export const waMessages = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({ cfg: EvolutionConfigSchema, chatId: z.string().min(3).max(120), limit: z.number().int().min(1).max(100).optional() })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { getMessages } = await import("./whatsapp.server");
    return getMessages(data.cfg, data.chatId, data.limit ?? 20);
  });
