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
    scopes: [...BASE_SCOPES, "https://www.googleapis.com/auth/calendar.events"],
  },
  google_mail: {
    envVar: "GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [
      ...BASE_SCOPES,
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  },
  google_drive: {
    envVar: "GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [...BASE_SCOPES, "https://www.googleapis.com/auth/drive.readonly"],
  },
  google_docs: {
    envVar: "GOOGLE_DOCS_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [
      ...BASE_SCOPES,
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  },
  google_slides: {
    envVar: "GOOGLE_SLIDES_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [
      ...BASE_SCOPES,
      "https://www.googleapis.com/auth/presentations.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
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
    connectionAPIKey: opts.existingKey ?? undefined,
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
    init: opts.init,
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
  })) as { items?: Array<Record<string, any>> };
  return (data?.items ?? []).map((e) => ({
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
  })) as { files?: Array<Record<string, any>> };
  return (data?.files ?? []).map((f) => ({
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
  })) as { title?: string; body?: { content?: Array<Record<string, any>> } };
  const text = (doc?.body?.content ?? [])
    .flatMap((el) => el?.paragraph?.elements ?? [])
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
  })) as { title?: string; slides?: Array<Record<string, any>> };
  const slides = (pres?.slides ?? []).map((slide, index) => {
    const text = (slide?.pageElements ?? [])
      .flatMap((el: any) => el?.shape?.text?.textElements ?? [])
      .map((el: any) => el?.textRun?.content ?? "")
      .join("")
      .trim();
    return { index: index + 1, text };
  });
  return { presentationId, title: pres?.title ?? "(sem título)", slides };
}
