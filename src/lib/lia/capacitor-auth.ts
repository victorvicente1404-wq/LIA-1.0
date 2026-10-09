import { supabase } from "@/integrations/supabase/client";

export const NATIVE_AUTH_SCHEME = "liaapp://auth";
/**
 * Página web pública que recebe o retorno do login e repassa para liaapp://auth.
 * O servidor de login só aceita endereços web autorizados; esquemas próprios
 * (liaapp://) são recusados e caem na versão web — por isso a ponte.
 */
export const NATIVE_AUTH_BRIDGE = "https://lia-portable-ai.lovable.app/native-callback";

export async function isNativeApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

export type AuthDeepLinkParams = {
  code?: string | undefined;
  access_token?: string | undefined;
  refresh_token?: string | undefined;
  error?: string | undefined;
};

/**
 * Normaliza o link de retorno para liaapp://auth...
 * Aceita liaapp://auth, liaapp:/auth, liaapp:auth e intent://auth...#Intent;scheme=liaapp;end.
 */
export function normalizeAuthDeepLink(url: string): string | null {
  if (!url) return null;
  let u = url.trim();
  if (/^intent:\/\//i.test(u)) {
    const marker = u.search(/#Intent;/i);
    let body = marker >= 0 ? u.slice("intent://".length, marker) : u.slice("intent://".length);
    // Hash real (tokens) pode vir antes do #Intent; já está em body se houver.
    u = `liaapp://${body}`;
  }
  u = u.replace(/^liaapp:\/*/i, "liaapp://");
  if (!u.toLowerCase().startsWith(NATIVE_AUTH_SCHEME)) return null;
  return u;
}

/** Lê ?query e #hash do deep link (os dois formatos) e junta num só objeto. */
export function parseAuthDeepLink(rawUrl: string): AuthDeepLinkParams | null {
  const url = normalizeAuthDeepLink(rawUrl);
  if (!url) return null;
  const rest = url.slice(NATIVE_AUTH_SCHEME.length);
  const hashIdx = rest.indexOf("#");
  const beforeHash = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
  const hashPart = hashIdx >= 0 ? rest.slice(hashIdx + 1) : "";
  const qIdx = beforeHash.indexOf("?");
  const queryPart = qIdx >= 0 ? beforeHash.slice(qIdx + 1) : "";

  const all = new URLSearchParams(queryPart);
  // Hash pode vir como "#access_token=..." ou "#/callback?access_token=..."
  const cleanHash = hashPart.includes("?") ? hashPart.slice(hashPart.indexOf("?") + 1) : hashPart;
  new URLSearchParams(cleanHash).forEach((v, k) => {
    if (!all.has(k)) all.set(k, v);
  });

  const get = (k: string) => all.get(k) ?? undefined;
  return {
    code: get("code"),
    access_token: get("access_token"),
    refresh_token: get("refresh_token"),
    error: get("error_description") ?? get("error"),
  };
}

/** Troca o deep link por uma sessão e só retorna ok quando a sessão está confirmada. */
export async function handleAuthDeepLink(url: string): Promise<{ ok: boolean; error?: string }> {
  const p = parseAuthDeepLink(url);
  if (!p) return { ok: false };
  console.log("[Native Auth] Deep link recebido. Parâmetros:", {
    code: !!p.code,
    access_token: !!p.access_token,
    refresh_token: !!p.refresh_token,
    error: p.error,
  });
  if (p.error) return { ok: false, error: p.error };

  try {
    if (p.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(p.code);
      if (error) {
        console.error("[Native Auth] exchangeCodeForSession falhou:", error);
        // Se também vieram tokens, tenta por eles antes de desistir.
        if (!(p.access_token && p.refresh_token)) return { ok: false, error: error.message };
      }
    }
    if (p.access_token && p.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token,
      });
      if (error) {
        console.error("[Native Auth] setSession falhou:", error);
        return { ok: false, error: error.message };
      }
    }
    if (!p.code && !(p.access_token && p.refresh_token)) {
      return { ok: false, error: "Retorno de login sem credenciais." };
    }

    // Confirma que a sessão foi realmente gravada.
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { ok: false, error: "A sessão não foi salva no app." };
    console.log("[Native Auth] Sessão confirmada para", data.session.user.email);
    return { ok: true };
  } catch (err) {
    console.error("[Native Auth] Falha inesperada:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao concluir o login." };
  }
}

const handled = new Set<string>();

/** Registers the Capacitor appUrlOpen listener. Call from useEffect; returns cleanup. */
export async function registerCapacitorAuthListener(
  onResult: (r: { ok: boolean; error?: string }) => void,
): Promise<() => void> {
  if (!(await isNativeApp())) return () => {};
  const { App } = await import("@capacitor/app");

  const closeBrowser = async () => {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Promise.race([Browser.close(), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* navegador pode não estar aberto */
    }
  };

  const run = async (url: string) => {
    console.log("[Native Auth] appUrlOpen:", url?.slice(0, 40));
    if (!normalizeAuthDeepLink(url)) return;
    if (handled.has(url)) return; // getLaunchUrl + appUrlOpen podem repetir o mesmo link
    handled.add(url);
    void closeBrowser(); // não bloqueia a criação da sessão
    onResult(await handleAuthDeepLink(url));
  };

  const handle = await App.addListener("appUrlOpen", ({ url }) => void run(url));
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) void run(launch.url);
  } catch {
    /* sem URL de lançamento */
  }
  return () => void handle.remove();
}
