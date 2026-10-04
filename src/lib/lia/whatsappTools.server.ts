// Server-only. Ferramentas de WhatsApp (Evolution API) que a Lia usa na conversa.
import { tool } from "ai";
import { z } from "zod";
import { getChats, getMessages, sendMessage, type EvolutionConfig } from "./whatsapp.server";

export function buildWhatsAppTools(cfg: EvolutionConfig): Record<string, unknown> {
  return {
    whatsapp_conversas: tool({
      description:
        "Lista as conversas e grupos do WhatsApp do usuário, com não lidas e última mensagem. Use para descobrir o id (chatId) de um contato pelo nome.",
      inputSchema: z.object({ busca: z.string().optional().describe("Filtrar pelo nome") }),
      execute: async ({ busca }) => {
        const chats = await getChats(cfg);
        const q = busca?.toLowerCase();
        return (q ? chats.filter((c) => c.name.toLowerCase().includes(q) || c.id.includes(q)) : chats).slice(0, 25);
      },
    }),
    whatsapp_mensagens: tool({
      description: "Lê o histórico de mensagens de uma conversa do WhatsApp (chatId ou número).",
      inputSchema: z.object({
        chatId: z.string(),
        limite: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ chatId, limite }) => getMessages(cfg, chatId, limite ?? 20),
    }),
    whatsapp_enviar: tool({
      description:
        "Envia uma mensagem de texto no WhatsApp. 'para' pode ser um número com DDI/DDD (ex.: 5571999999999) ou um chatId. Se o usuário der só o nome, use whatsapp_conversas antes.",
      inputSchema: z.object({ para: z.string(), mensagem: z.string().min(1) }),
      execute: async ({ para, mensagem }) => sendMessage(cfg, para, mensagem),
    }),
  };
}
