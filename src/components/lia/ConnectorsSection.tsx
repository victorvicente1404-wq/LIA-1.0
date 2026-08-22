import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Plug, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONNECTORS } from "@/lib/lia/connectors";
import { useConnections } from "@/lib/lia/useConnections";
import {
  completeConnect,
  disconnectConnector,
  getRecentEmails,
  getUpcomingEvents,
  searchDrive,
  sendGmailMessage,
  startConnect,
} from "@/lib/lia/connectors.functions";

function waitForOAuthCompletion(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("A autorização falhou."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("A janela de autorização foi fechada."));
    }, 500);
  });
}

export function ConnectorsSection() {
  const { user, authLoading, connectedIds, isLoading, refresh } = useConnections();
  const [busy, setBusy] = useState<string | null>(null);

  async function connect(connectorId: string) {
    const popup = window.open("", "lia-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Permita janelas pop-up para conectar.");
      return;
    }
    setBusy(connectorId);
    try {
      const { authorizationUrl } = await startConnect({ data: { connectorId } });
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      if (code) await completeConnect({ data: { code } });
      await refresh();
      toast.success("Serviço conectado.");
    } catch (err) {
      popup.close();
      toast.error(err instanceof Error ? err.message : "Não consegui conectar.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(connectorId: string) {
    setBusy(connectorId);
    try {
      await disconnectConnector({ data: { connectorId } });
      await refresh();
      toast.success("Serviço desconectado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui desconectar.");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (!user) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-glow">Conectores</h3>
        <p className="text-sm text-muted-foreground">
          Para eu acessar seus serviços com segurança, você precisa entrar na sua conta. As
          autorizações ficam criptografadas no servidor, nunca no navegador.
        </p>
        <Button asChild size="sm">
          <Link to="/auth">Entrar na minha conta</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-glow">Conectores</h3>
        <p className="text-xs text-muted-foreground">
          Cada serviço é autorizado por você e vale só para a sua conta.
        </p>
      </div>

      <div className="space-y-2">
        {CONNECTORS.map((c) => {
          const connected = connectedIds.includes(c.id);
          return (
            <div
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-2/40 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.description}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isLoading ? "verificando…" : connected ? "conectado" : "desconectado"}
                </p>
              </div>
              <Button
                size="sm"
                variant={connected ? "outline" : "default"}
                disabled={busy === c.id}
                onClick={() => (connected ? disconnect(c.id) : connect(c.id))}
              >
                {busy === c.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : connected ? (
                  <Unplug className="h-3.5 w-3.5" />
                ) : (
                  <Plug className="h-3.5 w-3.5" />
                )}
                {connected ? "Desconectar" : "Conectar"}
              </Button>
            </div>
          );
        })}
      </div>

      {connectedIds.includes("google_calendar") && <AgendaBlock />}
      {connectedIds.includes("google_mail") && <EmailBlock />}
      {connectedIds.includes("google_drive") && <DriveBlock />}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function AgendaBlock() {
  const [items, setItems] = useState<
    { id: string; title: string; start: string; location: string | null }[] | null
  >(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      setItems(await getUpcomingEvents());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler a agenda.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block title="Próximos compromissos">
      <Button size="sm" variant="outline" onClick={load} disabled={busy}>
        {busy ? "Buscando…" : "Atualizar agenda"}
      </Button>
      <ul className="space-y-1 text-xs">
        {items?.map((e) => (
          <li key={e.id} className="text-muted-foreground">
            <span className="text-foreground">{e.title}</span> —{" "}
            {new Date(e.start).toLocaleString("pt-BR")}
          </li>
        ))}
        {items?.length === 0 && <li className="text-muted-foreground">Nada por perto.</li>}
      </ul>
    </Block>
  );
}

function EmailBlock() {
  const [items, setItems] = useState<{ id: string; from: string; subject: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function load() {
    setBusy(true);
    try {
      setItems(await getRecentEmails());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler os e-mails.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    try {
      await sendGmailMessage({ data: { to, subject, body } });
      toast.success("E-mail enviado.");
      setTo("");
      setSubject("");
      setBody("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block title="Gmail">
      <Button size="sm" variant="outline" onClick={load} disabled={busy}>
        {busy ? "Buscando…" : "Ver e-mails recentes"}
      </Button>
      <ul className="space-y-1 text-xs">
        {items?.map((m) => (
          <li key={m.id} className="truncate text-muted-foreground">
            <span className="text-foreground">{m.subject}</span> — {m.from}
          </li>
        ))}
      </ul>
      <div className="space-y-2 pt-2">
        <Input placeholder="Para" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input
          placeholder="Assunto"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          placeholder="Mensagem"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        <Button size="sm" onClick={send} disabled={busy || !to || !body}>
          Enviar e-mail
        </Button>
      </div>
    </Block>
  );
}

function DriveBlock() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ id: string; name: string; link: string | null }[] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setItems(await searchDrive({ data: { query } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar arquivos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block title="Drive">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar arquivo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={run} disabled={busy}>
          Buscar
        </Button>
      </div>
      <ul className="space-y-1 text-xs">
        {items?.map((f) => (
          <li key={f.id} className="truncate">
            {f.link ? (
              <a href={f.link} target="_blank" rel="noreferrer" className="hover:text-glow">
                {f.name}
              </a>
            ) : (
              f.name
            )}
          </li>
        ))}
      </ul>
    </Block>
  );
}
