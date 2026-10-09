import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { buildNativeReturn } from "@/lib/lia/native-return";

export const Route = createFileRoute("/native-callback")({
  head: () => ({
    meta: [
      { title: "Voltando para o app da Lia" },
      { name: "description", content: "Concluindo o login e retornando para o aplicativo da Lia." },
      { property: "og:title", content: "Voltando para o app da Lia" },
      { property: "og:description", content: "Concluindo o login no aplicativo da Lia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NativeCallback,
});

// Ponte: o Google/servidor de login devolve para esta página web,
// e ela repassa os dados de sessão para o app nativo via liaapp://auth.
function NativeCallback() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const { search, hash } = window.location;
    const { scheme, intent } = buildNativeReturn(search, hash);
    // Remove os tokens da barra de endereço do navegador externo.
    window.history.replaceState(null, "", window.location.pathname);

    // Se esta página abriu dentro do próprio app (WebView), salva a sessão aqui mesmo.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    if (cap?.isNativePlatform?.()) {
      void import("@/lib/lia/capacitor-auth").then(async ({ handleAuthDeepLink }) => {
        const r = await handleAuthDeepLink(scheme);
        window.location.replace(r.ok ? "/" : "/auth");
      });
      return;
    }

    const isAndroid = /android/i.test(navigator.userAgent);
    setTarget(scheme);
    window.location.href = scheme;
    // Se o esquema direto for ignorado, tenta o intent do Android.
    if (isAndroid) {
      const t = window.setTimeout(() => {
        if (document.visibilityState === "visible") window.location.href = intent;
      }, 1200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold text-glow">Voltando para a Lia…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Se o app não abrir sozinho, toque no botão abaixo.
        </p>
        {target && (
          <a
            href={target}
            className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Abrir o app da Lia
          </a>
        )}
      </div>
    </main>
  );
}
