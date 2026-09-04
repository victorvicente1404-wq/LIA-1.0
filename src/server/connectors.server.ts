// Server-only. Configuração e chamadas aos serviços conectados pelo usuário.
import {
  authorizeAppUserOAuth,
  callAsAppUser,
  disconnectAppUser,
} from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "./appUserConnections.server";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

const BASE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export const CONNECTOR_CONFIG: Record<
  string,
  { envVar: string; scopes: string[] }
> = {
  google_calendar: {
    envVar: "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [...BASE_SCOPES, "https://www.googleapis.com/auth/calendar"],
  },
  google_mail: {
    envVar: "GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [
      ...BASE_SCOPES,
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  },
  google_drive: {
    envVar: "GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [...BASE_SCOPES, "https://www.googleapis.com/auth/drive"],
  },
  google_docs: {
    envVar: "GOOGLE_DOCS_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [
      ...BASE_SCOPES,
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
    ],
  },
  google_slides: {
    envVar: "GOOGLE_SLIDES_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [
      ...BASE_SCOPES,
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/drive",
    ],
  },

};

export function requireConnectorConfig(connectorId: string) {
  const config = CONNECTOR_CONFIG[connectorId];
  if (!config) throw new Error(`Serviço desconhecido: ${connectorId}`);
  const clientAPIKey = process.env[config.envVar];
  if (!clientAPIKey) throw new Error(`${config.envVar} não está configurado.`);
  return { ...config, clientAPIKey };
}

export async function buildAuthorizationUrl(opts: {
  connectorId: string;
  userId: string;
  returnUrl: string;
  existingKey?: string | null;
}) {
  const { clientAPIKey, scopes } = requireConnectorConfig(opts.connectorId);
  const { authorizationUrl } = await authorizeAppUserOAuth({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectorId: opts.connectorId,
    appUserId: opts.userId,
    clientAPIKey,
    returnUrl: opts.returnUrl,
    ...(opts.existingKey ? { connectionAPIKey: opts.existingKey } : {}),
    credentialsConfiguration: { scopes },
  });
  return authorizationUrl;
}

export async function providerFetch(opts: {
  userId: string;
  connectorId: string;
  path: string;
  init?: RequestInit;
}): Promise<unknown> {
  const connectionAPIKey = await getConnectionKeyForUser(opts.userId, opts.connectorId);
  if (!connectionAPIKey) {
    throw new Error(`Serviço ${opts.connectorId} não está conectado para este usuário.`);
  }
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: opts.connectorId,
    path: opts.path,
    ...(opts.init ? { init: opts.init } : {}),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gateway ${opts.connectorId} ${opts.path} [${res.status}]: ${body}`);
    throw new Error(`Falha ao falar com ${opts.connectorId} [${res.status}]: ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function revokeConnection(userId: string, connectorId: string) {
  const connectionAPIKey = await getConnectionKeyForUser(userId, connectorId);
  if (connectionAPIKey) {
    await disconnectAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId,
    });
  }
}

// ---------- Ações de alto nível ----------

export async function fetchUpcomingEvents(userId: string, max = 8) {
  const now = new Date().toISOString();
  const data = (await providerFetch({
    userId,
    connectorId: "google_calendar",
    path: `/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      now,
    )}&singleEvents=true&orderBy=startTime&maxResults=${max}`,
  })) as { items?: any[] };
  return (data?.items ?? []).map((e: any) => ({
    id: String(e.id ?? ""),
    title: String(e.summary ?? "(sem título)"),
    start: String(e.start?.dateTime ?? e.start?.date ?? ""),
    end: String(e.end?.dateTime ?? e.end?.date ?? ""),
    location: e.location ? String(e.location) : null,
  }));
}

function headerValue(headers: Array<{ name?: string; value?: string }>, name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function fetchRecentEmails(userId: string, max = 8) {
  const list = (await providerFetch({
    userId,
    connectorId: "google_mail",
    path: `/gmail/v1/users/me/messages?maxResults=${max}&labelIds=INBOX`,
  })) as { messages?: Array<{ id: string }> };
  const ids = (list?.messages ?? []).map((m) => m.id).slice(0, max);
  const messages = await Promise.all(
    ids.map(async (id) => {
      const msg = (await providerFetch({
        userId,
        connectorId: "google_mail",
        path: `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      })) as { snippet?: string; payload?: { headers?: Array<{ name?: string; value?: string }> } };
      const headers = msg?.payload?.headers ?? [];
      return {
        id,
        from: headerValue(headers, "From"),
        subject: headerValue(headers, "Subject") || "(sem assunto)",
        date: headerValue(headers, "Date"),
        snippet: msg?.snippet ?? "",
      };
    }),
  );
  return messages;
}

function base64Url(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmail(
  userId: string,
  input: { to: string; subject: string; body: string },
) {
  const raw = base64Url(
    [
      `To: ${input.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      input.body,
    ].join("\r\n"),
  );
  return providerFetch({
    userId,
    connectorId: "google_mail",
    path: "/gmail/v1/users/me/messages/send",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  });
}

export async function searchDriveFiles(userId: string, query: string, max = 10) {
  const q = query.trim()
    ? `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`
    : "trashed = false";
  const data = (await providerFetch({
    userId,
    connectorId: "google_drive",
    path: `/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${max}&orderBy=modifiedTime desc&fields=${encodeURIComponent(
      "files(id,name,mimeType,modifiedTime,webViewLink)",
    )}`,
  })) as { files?: any[] };
  return (data?.files ?? []).map((f: any) => ({
    id: String(f.id),
    name: String(f.name),
    mimeType: String(f.mimeType ?? ""),
    modifiedTime: String(f.modifiedTime ?? ""),
    link: f.webViewLink ? String(f.webViewLink) : null,
  }));
}

function extractId(input: string) {
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? input.trim();
}

export async function readDocument(userId: string, documentRef: string) {
  const documentId = extractId(documentRef);
  const doc = (await providerFetch({
    userId,
    connectorId: "google_docs",
    path: `/v1/documents/${documentId}`,
  })) as { title?: string; body?: { content?: any[] } };
  const text = (doc?.body?.content ?? [])
    .flatMap((el: any) => el?.paragraph?.elements ?? [])
    .map((el: any) => el?.textRun?.content ?? "")
    .join("");
  return { documentId, title: doc?.title ?? "(sem título)", text: text.trim() };
}

export async function appendToDocument(userId: string, documentRef: string, text: string) {
  const documentId = extractId(documentRef);
  await providerFetch({
    userId,
    connectorId: "google_docs",
    path: `/v1/documents/${documentId}:batchUpdate`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ insertText: { endOfSegmentLocation: {}, text: `\n${text}` } }],
      }),
    },
  });
  return { documentId, ok: true };
}

export async function readPresentation(userId: string, presentationRef: string) {
  const presentationId = extractId(presentationRef);
  const pres = (await providerFetch({
    userId,
    connectorId: "google_slides",
    path: `/v1/presentations/${presentationId}`,
  })) as { title?: string; slides?: any[] };
  const slides = (pres?.slides ?? []).map((slide: any, index: number) => {
    const text = (slide?.pageElements ?? [])
      .flatMap((el: any) => el?.shape?.text?.textElements ?? [])
      .map((el: any) => el?.textRun?.content ?? "")
      .join("")
      .trim();
    return { index: index + 1, text };
  });
  return { presentationId, title: pres?.title ?? "(sem título)", slides };
}

// ---------- Agenda: leitura ampla e escrita ----------

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  description: string | null;
  attendees: string[];
  link: string | null;
};

function mapEvent(e: any): CalendarEvent {
  return {
    id: String(e?.id ?? ""),
    title: String(e?.summary ?? "(sem título)"),
    start: String(e?.start?.dateTime ?? e?.start?.date ?? ""),
    end: String(e?.end?.dateTime ?? e?.end?.date ?? ""),
    location: e?.location ? String(e.location) : null,
    description: e?.description ? String(e.description) : null,
    attendees: Array.isArray(e?.attendees)
      ? e.attendees.map((a: any) => String(a?.email ?? "")).filter(Boolean)
      : [],
    link: e?.htmlLink ? String(e.htmlLink) : null,
  };
}

export async function findCalendarEvents(
  userId: string,
  opts: { query?: string; timeMin?: string; timeMax?: string; max?: number } = {},
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(opts.max ?? 10),
    timeMin: opts.timeMin ?? new Date().toISOString(),
  });
  if (opts.timeMax) params.set("timeMax", opts.timeMax);
  if (opts.query) params.set("q", opts.query);
  const data = (await providerFetch({
    userId,
    connectorId: "google_calendar",
    path: `/calendar/v3/calendars/primary/events?${params.toString()}`,
  })) as { items?: any[] };
  return (data?.items ?? []).map(mapEvent);
}

function eventTime(value: string) {
  return value.length === 10
    ? { date: value }
    : { dateTime: value, timeZone: DEFAULT_TIMEZONE };
}

export async function createCalendarEvent(
  userId: string,
  input: {
    title: string;
    start: string;
    end: string;
    description?: string;
    location?: string;
    attendees?: string[];
  },
): Promise<CalendarEvent> {
  const body = {
    summary: input.title,
    start: eventTime(input.start),
    end: eventTime(input.end),
    ...(input.description ? { description: input.description } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.attendees?.length ? { attendees: input.attendees.map((email) => ({ email })) } : {}),
  };
  const created = await providerFetch({
    userId,
    connectorId: "google_calendar",
    path: "/calendar/v3/calendars/primary/events?sendUpdates=all",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  });
  return mapEvent(created);
}

export async function updateCalendarEvent(
  userId: string,
  input: {
    eventId: string;
    title?: string;
    start?: string;
    end?: string;
    description?: string;
    location?: string;
  },
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {};
  if (input.title) body["summary"] = input.title;
  if (input.start) body["start"] = eventTime(input.start);
  if (input.end) body["end"] = eventTime(input.end);
  if (input.description !== undefined) body["description"] = input.description;
  if (input.location !== undefined) body["location"] = input.location;
  const updated = await providerFetch({
    userId,
    connectorId: "google_calendar",
    path: `/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}?sendUpdates=all`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  });
  return mapEvent(updated);
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  await providerFetch({
    userId,
    connectorId: "google_calendar",
    path: `/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    init: { method: "DELETE" },
  });
  return { ok: true as const, eventId };
}

// ---------- Gmail: busca, leitura completa e contatos ----------

export async function searchEmails(userId: string, query: string, max = 8) {
  const params = new URLSearchParams({ maxResults: String(max) });
  if (query.trim()) params.set("q", query.trim());
  else params.set("labelIds", "INBOX");
  const list = (await providerFetch({
    userId,
    connectorId: "google_mail",
    path: `/gmail/v1/users/me/messages?${params.toString()}`,
  })) as { messages?: Array<{ id: string }> };
  const ids = (list?.messages ?? []).map((m) => m.id).slice(0, max);
  return Promise.all(
    ids.map(async (id) => {
      const msg = (await providerFetch({
        userId,
        connectorId: "google_mail",
        path: `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      })) as { snippet?: string; payload?: { headers?: Array<{ name?: string; value?: string }> } };
      const headers = msg?.payload?.headers ?? [];
      return {
        id,
        from: headerValue(headers, "From"),
        to: headerValue(headers, "To"),
        subject: headerValue(headers, "Subject") || "(sem assunto)",
        date: headerValue(headers, "Date"),
        snippet: msg?.snippet ?? "",
      };
    }),
  );
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function collectBody(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  const parts: any[] = part.parts ?? [];
  const fromParts = parts.map(collectBody).filter(Boolean).join("\n");
  if (fromParts) return fromParts;
  if (part.body?.data && String(part.mimeType ?? "").startsWith("text/")) {
    return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

export async function readEmail(userId: string, messageId: string) {
  const msg = (await providerFetch({
    userId,
    connectorId: "google_mail",
    path: `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  })) as { snippet?: string; payload?: any; threadId?: string };
  const headers = msg?.payload?.headers ?? [];
  const body = collectBody(msg?.payload).trim() || (msg?.snippet ?? "");
  return {
    id: messageId,
    threadId: msg?.threadId ?? null,
    from: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject") || "(sem assunto)",
    date: headerValue(headers, "Date"),
    body: body.slice(0, 6000),
  };
}

/** Encontra o e-mail de alguém a partir do nome, olhando as conversas recentes. */
export async function findContactEmail(userId: string, name: string) {
  const results = await searchEmails(userId, `${name}`, 8);
  const emails = new Map<string, string>();
  for (const m of results) {
    for (const field of [m.from, m.to]) {
      const match = field.match(/([^<\s]+@[^>\s]+)/);
      const address = match?.[1]?.replace(/[<>]/g, "");
      if (address && field.toLowerCase().includes(name.toLowerCase().split(" ")[0] ?? name)) {
        emails.set(address, field);
      }
    }
  }
  return Array.from(emails.entries()).map(([email, label]) => ({ email, label }));
}

export async function markEmailRead(userId: string, messageId: string) {
  await providerFetch({
    userId,
    connectorId: "google_mail",
    path: `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    },
  });
  return { ok: true as const };
}

// ---------- Docs / Slides / Drive: escrita ----------

export async function createGoogleDoc(userId: string, title: string, text?: string) {
  const doc = (await providerFetch({
    userId,
    connectorId: "google_docs",
    path: "/v1/documents",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  })) as { documentId?: string };
  const documentId = String(doc?.documentId ?? "");
  if (documentId && text) await appendToDocument(userId, documentId, text);
  return {
    documentId,
    title,
    link: documentId ? `https://docs.google.com/document/d/${documentId}/edit` : null,
  };
}

export async function replaceInDocument(
  userId: string,
  documentRef: string,
  find: string,
  replace: string,
) {
  const documentId = extractId(documentRef);
  await providerFetch({
    userId,
    connectorId: "google_docs",
    path: `/v1/documents/${documentId}:batchUpdate`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            replaceAllText: {
              containsText: { text: find, matchCase: false },
              replaceText: replace,
            },
          },
        ],
      }),
    },
  });
  return { documentId, ok: true as const };
}

export async function replaceInPresentation(
  userId: string,
  presentationRef: string,
  find: string,
  replace: string,
) {
  const presentationId = extractId(presentationRef);
  await providerFetch({
    userId,
    connectorId: "google_slides",
    path: `/v1/presentations/${presentationId}:batchUpdate`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            replaceAllText: {
              containsText: { text: find, matchCase: false },
              replaceText: replace,
            },
          },
        ],
      }),
    },
  });
  return { presentationId, ok: true as const };
}

export async function renameDriveFile(userId: string, fileRef: string, name: string) {
  const fileId = extractId(fileRef);
  await providerFetch({
    userId,
    connectorId: "google_drive",
    path: `/drive/v3/files/${fileId}`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  });
  return { fileId, name, ok: true as const };
}

export async function trashDriveFile(userId: string, fileRef: string) {
  const fileId = extractId(fileRef);
  await providerFetch({
    userId,
    connectorId: "google_drive",
    path: `/drive/v3/files/${fileId}`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  });
  return { fileId, ok: true as const };
}
