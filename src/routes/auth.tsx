import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar na Lia — sua assistente pessoal de IA" },
      {
        name: "description",
        content:
          "Acesse sua conta da Lia para conectar Google Agenda, Gmail, Drive, Docs e Slides com segurança.",
      },
      { property: "og:title", content: "Entrar na Lia" },
      {
        property: "og:description",
        content: "Acesse sua conta para conectar seus serviços pessoais à Lia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  // Assim que a sessão chegar (ex.: retorno do Google no app), vai para a tela inicial.
  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      navigate({ to: "/", replace: true });
    };
    supabase.auth.getSession().then(({ data }) => data.session && go());
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) go();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Conta criada. Verifique seu e-mail se for solicitado.");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui autenticar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const { isNativeApp, NATIVE_AUTH_BRIDGE } = await import("@/lib/lia/capacitor-auth");
    const native = await isNativeApp();

    if (native) {
      // No app nativo: abre o login no navegador, volta para a página ponte,
      // que reabre o app via liaapp://auth com a sessão.
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: NATIVE_AUTH_BRIDGE,
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        });
        if (error) {
          console.error("[Google Auth] Erro do Supabase:", error);
          toast.error(error.message);
          setBusy(false);
          return;
        }
        if (!data?.url) {
          console.error("[Google Auth] Resposta sem URL de autenticação.");
          toast.error("O Google não retornou o link de login.");
          setBusy(false);
          return;
        }
        console.log("[Google Auth] Abrindo URL de autenticação:", data.url);
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.open({ url: data.url });
        } catch (browserErr) {
          console.warn("[Google Auth] @capacitor/browser indisponível, usando fallback:", browserErr);
          const opened = window.open(data.url, "_system");
          if (!opened) window.location.href = data.url;
        }
      } catch (err) {
        console.error("[Google Auth] Falha inesperada:", err);
        toast.error(err instanceof Error ? err.message : "Não consegui entrar com o Google.");
      }
      setBusy(false);
      return; // o listener de deep link conclui o login
    }

    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Não consegui entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold text-glow">Entrar na Lia</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua conta guarda, de forma criptografada, as autorizações dos seus serviços.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {mode === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <Button variant="outline" onClick={handleGoogle} disabled={busy} className="mt-3 w-full">
          Continuar com Google
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
          className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "entrar" ? "Não tenho conta — criar agora" : "Já tenho conta — entrar"}
        </button>
      </div>
    </main>
  );
}
