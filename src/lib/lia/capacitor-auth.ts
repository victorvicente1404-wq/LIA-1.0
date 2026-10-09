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

/** Parses a liaapp://auth deep link and sets the session. Returns true when signed in. */
export async function handleAuthDeepLink(url: string): Promise<{ ok: boolean; error?: string }> {
  if (!url.startsWith(NATIVE_AUTH_SCHEME)) return { ok: false };
  const parsed = new URL(url.replace(/^liaapp:\/\//, "https://app.local/"));
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const query = parsed.searchParams;
  const err = query.get("error_description") ?? query.get("error") ?? hash.get("error_description") ?? hash.get("error");
  if (err) return { ok: false, error: err };

  const access_token = hash.get("access_token") ?? query.get("access_token");
  const refresh_token = hash.get("refresh_token") ?? query.get("refresh_token");
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const code = query.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  return { ok: false, error: "Retorno de login sem credenciais." };
}

/** Registers the Capacitor appUrlOpen listener. Call from useEffect; returns cleanup. */
export async function registerCapacitorAuthListener(
  onResult: (r: { ok: boolean; error?: string }) => void,
): Promise<() => void> {
  if (!(await isNativeApp())) return () => {};
  const { App } = await import("@capacitor/app");
  const { Browser } = await import("@capacitor/browser");
  const run = async (url: string) => {
    if (!url?.startsWith(NATIVE_AUTH_SCHEME)) return;
    try {
      await Browser.close();
    } catch {
      /* browser may not be open */
    }
    onResult(await handleAuthDeepLink(url));
  };
  const handle = await App.addListener("appUrlOpen", ({ url }) => void run(url));
  const launch = await App.getLaunchUrl();
  if (launch?.url) void run(launch.url);
  return () => void handle.remove();
}
