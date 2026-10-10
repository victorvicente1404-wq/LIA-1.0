import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listConnectionsForUser } = await import("@/server/appUserConnections.server");
    const rows = await listConnectionsForUser(context.userId);
    return rows.map((r) => ({
      connectorId: r.connector_id,
      accountLabel: r.account_label,
      updatedAt: r.updated_at,
    }));
  });

export const startConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectorId: string; origin?: string; fresh?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { buildAuthorizationUrl } = await import("@/server/connectors.server");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const request = getRequest();
    if (!request) throw new Error("A conexão precisa começar por uma requisição do app.");
    const url = new URL(request.url);
    const sandboxHost =
      url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const serverOrigin = sandboxHost ? `https://${sandboxHost}` : url.origin;
    // Usa a origem exata da página que abriu a janela (preview, publicado ou domínio próprio),
    // desde que seja confiável; senão, a origem vista pelo servidor.
    const origin = trustedOrigin(data.origin, serverOrigin, request.headers.get("origin"));
    const returnUrl = new URL("/oauth/return", origin).toString();
    const existingKey = data.fresh
      ? null
      : await getConnectionKeyForUser(context.userId, data.connectorId).catch(() => null);
    const authorizationUrl = await buildAuthorizationUrl({
      connectorId: data.connectorId,
      userId: context.userId,
      returnUrl,
      existingKey,
    });
    return { authorizationUrl };
  });

export const completeConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { GATEWAY_BASE_URL, CONNECTOR_CONFIG } = await import("@/server/connectors.server");
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    let result: { connectionAPIKey: string; connectorId: string };
    try {
      result = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Conectores] troca do código falhou:", msg);
      throw new Error(`Não consegui finalizar a autorização: ${msg.slice(0, 300)}`);
    }
    const { connectionAPIKey, connectorId } = result;
    if (!CONNECTOR_CONFIG[connectorId]) {
      throw new Error("A autorização retornou um serviço desconhecido.");
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    // Confere se ficou salvo de verdade.
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const saved = await getConnectionKeyForUser(context.userId, connectorId);
    if (saved !== connectionAPIKey) throw new Error("A autorização foi feita, mas não consegui salvá-la. Tente de novo.");
    return { ok: true, connectorId, scopes: CONNECTOR_CONFIG[connectorId]!.scopes };
  });

export const disconnectConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectorId: string }) => input)
  .handler(async ({ data, context }) => {
    const { revokeConnection } = await import("@/server/connectors.server");
    const { deleteConnectionForUser } = await import("@/server/appUserConnections.server");
    await revokeConnection(context.userId, data.connectorId);
    await deleteConnectionForUser(context.userId, data.connectorId);
    return { ok: true };
  });

export const getUpcomingEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchUpcomingEvents } = await import("@/server/connectors.server");
    return fetchUpcomingEvents(context.userId);
  });

export const getRecentEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchRecentEmails } = await import("@/server/connectors.server");
    return fetchRecentEmails(context.userId);
  });

export const sendGmailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string; subject: string; body: string }) => {
    if (!input.to.includes("@")) throw new Error("Destinatário inválido.");
    if (!input.body.trim()) throw new Error("A mensagem está vazia.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { sendEmail } = await import("@/server/connectors.server");
    await sendEmail(context.userId, data);
    return { ok: true };
  });

export const searchDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data, context }) => {
    const { searchDriveFiles } = await import("@/server/connectors.server");
    return searchDriveFiles(context.userId, data.query);
  });

export const readGoogleDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ref: string }) => input)
  .handler(async ({ data, context }) => {
    const { readDocument } = await import("@/server/connectors.server");
    return readDocument(context.userId, data.ref);
  });

export const appendGoogleDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ref: string; text: string }) => input)
  .handler(async ({ data, context }) => {
    const { appendToDocument } = await import("@/server/connectors.server");
    return appendToDocument(context.userId, data.ref, data.text);
  });

export const readGoogleSlides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ref: string }) => input)
  .handler(async ({ data, context }) => {
    const { readPresentation } = await import("@/server/connectors.server");
    return readPresentation(context.userId, data.ref);
  });

function trustedOrigin(client: string | undefined, server: string, header: string | null): string {
  try {
    if (!client) return server;
    const u = new URL(client);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return server;
    const host = u.hostname;
    const allowed =
      u.origin === server ||
      u.origin === header ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com");
    return allowed ? u.origin : server;
  } catch {
    return server;
  }
}
