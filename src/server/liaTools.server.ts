// Server-only. Ferramentas que a Lia executa diretamente nos serviços do usuário.
import { tool } from "ai";
import { z } from "zod";
import { listConnectionsForUser } from "./appUserConnections.server";
import {
  appendToDocument,
  createCalendarEvent,
  createGoogleDoc,
  deleteCalendarEvent,
  DEFAULT_TIMEZONE,
  findCalendarEvents,
  findContactEmail,
  markEmailRead,
  readDocument,
  readEmail,
  readPresentation,
  renameDriveFile,
  replaceInDocument,
  replaceInPresentation,
  searchDriveFiles,
  searchEmails,
  sendEmail,
  trashDriveFile,
  updateCalendarEvent,
} from "./connectors.server";

const iso = z
  .string()
  .describe("Data/hora ISO 8601 (ex.: 2026-09-05T14:00:00-03:00) ou data AAAA-MM-DD");

/** Constrói o conjunto de ferramentas conforme os serviços que o usuário conectou. */
export async function buildLiaTools(userId: string) {
  const connections = await listConnectionsForUser(userId);
  const has = (id: string) => connections.some((c) => c.connector_id === id);
  const tools: Record<string, unknown> = {};

  if (has("google_calendar")) {
    tools["agenda_listar"] = tool({
      description:
        "Lista compromissos da Google Agenda do usuário. Use para 'próximo compromisso', 'agenda de hoje/amanhã' ou buscar um evento pelo nome.",
      inputSchema: z.object({
        busca: z.string().optional().describe("Texto para filtrar os eventos"),
        de: iso.optional().describe("Início do intervalo; padrão: agora"),
        ate: iso.optional().describe("Fim do intervalo"),
        max: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ busca, de, ate, max }) =>
        findCalendarEvents(userId, {
          ...(busca ? { query: busca } : {}),
          ...(de ? { timeMin: de } : {}),
          ...(ate ? { timeMax: ate } : {}),
          ...(max ? { max } : {}),
        }),
    });

    tools["agenda_criar"] = tool({
      description: `Cria um compromisso na Google Agenda. Fuso padrão: ${DEFAULT_TIMEZONE}.`,
      inputSchema: z.object({
        titulo: z.string(),
        inicio: iso,
        fim: iso,
        descricao: z.string().optional(),
        local: z.string().optional(),
        convidados: z.array(z.string()).optional().describe("E-mails dos convidados"),
      }),
      execute: async ({ titulo, inicio, fim, descricao, local, convidados }) =>
        createCalendarEvent(userId, {
          title: titulo,
          start: inicio,
          end: fim,
          ...(descricao ? { description: descricao } : {}),
          ...(local ? { location: local } : {}),
          ...(convidados ? { attendees: convidados } : {}),
        }),
    });

    tools["agenda_editar"] = tool({
      description:
        "Altera um compromisso existente (horário, título, local). Descubra o id com agenda_listar antes.",
      inputSchema: z.object({
        eventoId: z.string(),
        titulo: z.string().optional(),
        inicio: iso.optional(),
        fim: iso.optional(),
        descricao: z.string().optional(),
        local: z.string().optional(),
      }),
      execute: async ({ eventoId, titulo, inicio, fim, descricao, local }) =>
        updateCalendarEvent(userId, {
          eventId: eventoId,
          ...(titulo ? { title: titulo } : {}),
          ...(inicio ? { start: inicio } : {}),
          ...(fim ? { end: fim } : {}),
          ...(descricao !== undefined ? { description: descricao } : {}),
          ...(local !== undefined ? { location: local } : {}),
        }),
    });

    tools["agenda_cancelar"] = tool({
      description: "Cancela/apaga um compromisso da agenda pelo id.",
      inputSchema: z.object({ eventoId: z.string() }),
      execute: async ({ eventoId }) => deleteCalendarEvent(userId, eventoId),
    });
  }

  if (has("google_mail")) {
    tools["email_listar"] = tool({
      description:
        "Busca e-mails no Gmail. Sem busca, traz os últimos da caixa de entrada. Aceita sintaxe do Gmail (ex.: 'is:unread', 'from:ana').",
      inputSchema: z.object({
        busca: z.string().optional(),
        max: z.number().int().min(1).max(15).optional(),
      }),
      execute: async ({ busca, max }) => searchEmails(userId, busca ?? "", max ?? 8),
    });

    tools["email_ler"] = tool({
      description: "Lê o conteúdo completo de um e-mail pelo id.",
      inputSchema: z.object({ mensagemId: z.string() }),
      execute: async ({ mensagemId }) => readEmail(userId, mensagemId),
    });

    tools["email_enviar"] = tool({
      description:
        "Envia um e-mail agora, pela conta do usuário. Execute direto quando ele pedir; não peça confirmação extra.",
      inputSchema: z.object({
        para: z.string().describe("Endereço de e-mail do destinatário"),
        assunto: z.string(),
        mensagem: z.string(),
      }),
      execute: async ({ para, assunto, mensagem }) => {
        await sendEmail(userId, { to: para, subject: assunto, body: mensagem });
        return { ok: true, para, assunto };
      },
    });

    tools["email_buscar_contato"] = tool({
      description:
        "Descobre o endereço de e-mail de uma pessoa pelo nome, olhando as conversas recentes. Use quando o usuário der só o nome.",
      inputSchema: z.object({ nome: z.string() }),
      execute: async ({ nome }) => findContactEmail(userId, nome),
    });

    tools["email_marcar_lido"] = tool({
      description: "Marca um e-mail como lido.",
      inputSchema: z.object({ mensagemId: z.string() }),
      execute: async ({ mensagemId }) => markEmailRead(userId, mensagemId),
    });
  }

  if (has("google_drive")) {
    tools["drive_buscar"] = tool({
      description: "Busca arquivos no Google Drive por nome.",
      inputSchema: z.object({
        busca: z.string().optional(),
        max: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ busca, max }) => searchDriveFiles(userId, busca ?? "", max ?? 10),
    });

    tools["drive_renomear"] = tool({
      description: "Renomeia um arquivo do Drive (id ou link).",
      inputSchema: z.object({ arquivo: z.string(), novoNome: z.string() }),
      execute: async ({ arquivo, novoNome }) => renameDriveFile(userId, arquivo, novoNome),
    });

    tools["drive_lixeira"] = tool({
      description: "Move um arquivo do Drive para a lixeira.",
      inputSchema: z.object({ arquivo: z.string() }),
      execute: async ({ arquivo }) => trashDriveFile(userId, arquivo),
    });
  }

  if (has("google_docs")) {
    tools["doc_ler"] = tool({
      description: "Lê o texto de um documento do Google Docs (id ou link).",
      inputSchema: z.object({ documento: z.string() }),
      execute: async ({ documento }) => readDocument(userId, documento),
    });

    tools["doc_criar"] = tool({
      description: "Cria um novo documento no Google Docs, opcionalmente já com texto.",
      inputSchema: z.object({ titulo: z.string(), texto: z.string().optional() }),
      execute: async ({ titulo, texto }) => createGoogleDoc(userId, titulo, texto),
    });

    tools["doc_acrescentar"] = tool({
      description: "Acrescenta texto ao final de um documento do Google Docs.",
      inputSchema: z.object({ documento: z.string(), texto: z.string() }),
      execute: async ({ documento, texto }) => appendToDocument(userId, documento, texto),
    });

    tools["doc_substituir"] = tool({
      description: "Substitui todas as ocorrências de um texto em um documento do Google Docs.",
      inputSchema: z.object({
        documento: z.string(),
        procurar: z.string(),
        substituirPor: z.string(),
      }),
      execute: async ({ documento, procurar, substituirPor }) =>
        replaceInDocument(userId, documento, procurar, substituirPor),
    });
  }

  if (has("google_slides")) {
    tools["slides_ler"] = tool({
      description: "Lê os textos dos slides de uma apresentação do Google Slides.",
      inputSchema: z.object({ apresentacao: z.string() }),
      execute: async ({ apresentacao }) => readPresentation(userId, apresentacao),
    });

    tools["slides_substituir"] = tool({
      description: "Substitui um texto em toda a apresentação do Google Slides.",
      inputSchema: z.object({
        apresentacao: z.string(),
        procurar: z.string(),
        substituirPor: z.string(),
      }),
      execute: async ({ apresentacao, procurar, substituirPor }) =>
        replaceInPresentation(userId, apresentacao, procurar, substituirPor),
    });
  }

  return { tools, connectedIds: connections.map((c) => c.connector_id) };
}
