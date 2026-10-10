import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/oauth/return")({
  head: () => ({
    meta: [
      { title: "Conectando serviço — Lia" },
      { name: "description", content: "Finalizando a autorização do seu serviço com a Lia." },
      { property: "og:title", content: "Conectando serviço — Lia" },
      { property: "og:description", content: "Finalizando a autorização do seu serviço." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finalizando a conexão…");

  const handled = useRef(false);
  useEffect(() => {
    // Strict Mode roda efeitos duas vezes: o código só pode ser enviado uma vez.
    if (handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const connectorId = params.get("connector_id") ?? "";
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string | null,
      error?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId, code: code ?? null, error: error ?? null },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      const parts = [params.get("error"), params.get("error_description"), params.get("error_uri")]
        .filter(Boolean)
        .map((v) => v!.slice(0, 300));
      const detail = parts.length ? parts.join(" — ") : "A autorização não foi concluída (nenhum detalhe retornado).";
      console.warn("[OAuth] retorno com erro:", detail);
      setMessage(`Falha: ${detail}`);
      // Mantém a janela aberta um instante para a pessoa ler o erro.
      window.opener?.postMessage({ type: "appUserConnectorOAuthFailed", connectorId, code: null, error: detail }, window.location.origin);
      setTimeout(() => window.close(), 4000);
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("A autorização terminou sem código de troca.");
      notify("appUserConnectorOAuthFailed", null, "A autorização terminou sem código de troca.");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
