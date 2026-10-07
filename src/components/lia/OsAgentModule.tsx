import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, KeyRound, Loader2, MonitorSmartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { createAgentToken, decideAction, getAgentState } from "@/lib/lia/osAgent.functions";
import { ACTION_LABEL, agentScript, readOsAgentPrefs, saveOsAgentPrefs, type OsAgentPrefs } from "@/lib/lia/os-agent";
import { cn } from "@/lib/utils";

type State = Awaited<ReturnType<typeof getAgentState>>;

export function OsAgentModule() {
  const { user } = useAuth() as { user: unknown };
  const fetchState = useServerFn(getAgentState);
  const genToken = useServerFn(createAgentToken);
  const decide = useServerFn(decideAction);
  const [prefs, setPrefs] = useState<OsAgentPrefs>({ enabled: false, autonomo: false });
  const [st, setSt] = useState<State | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setPrefs(readOsAgentPrefs()), []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = () => fetchState().then((s) => alive && setSt(s)).catch(() => null);
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [user, fetchState]);

  const update = (p: OsAgentPrefs) => { setPrefs(p); saveOsAgentPrefs(p); };
  const online = !!st?.lastSeen && Date.now() - new Date(st.lastSeen).getTime() < 15_000;

  const script = () => agentScript(window.location.origin, token ?? "COLE_SEU_TOKEN_AQUI");
  const copy = async () => { await navigator.clipboard.writeText(script()); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([script()], { type: "text/x-python" }));
    a.download = "agent.py";
    a.click();
  };

  return (
    <div className="mt-3 space-y-3 rounded-md border border-primary/30 bg-surface-2 p-3 shadow-[0_0_24px_-12px_var(--color-primary)]">
      <div className="flex items-center gap-2">
        <MonitorSmartphone className="h-4 w-4 text-primary" />
        <p className="flex-1 text-xs font-medium">Lia Agent (Controle do Computador & Celular)</p>
        <Switch checked={prefs.enabled} onCheckedChange={(v) => update({ ...prefs, enabled: v })} />
      </div>

      {!user ? (
        <p className="text-[11px] text-muted-foreground">Entre na sua conta para usar o Lia Agent.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("h-2 w-2 rounded-full", online ? "bg-primary animate-pulse" : "bg-muted-foreground/40")} />
            Desktop Agent: {online ? `Conectado${st?.platform ? ` (${st.platform})` : ""}` : "Desconectado"}
          </div>

          <div className="flex items-center justify-between gap-2 rounded bg-background/40 p-2">
            <div>
              <p className="text-xs">{prefs.autonomo ? "Modo 100% autônomo" : "Confirmação prévia"}</p>
              <p className="text-[11px] text-muted-foreground">
                {prefs.autonomo ? "A Lia executa as ações direto." : "Cada ação espera você aprovar aqui."}
              </p>
            </div>
            <Switch checked={prefs.autonomo} onCheckedChange={(v) => update({ ...prefs, autonomo: v })} />
          </div>

          <div className="space-y-2">
            <Button size="sm" variant="outline" onClick={async () => setToken((await genToken()).token)}>
              <KeyRound className="mr-2 h-4 w-4" /> {st?.hasToken ? "Gerar novo token" : "Gerar token"}
            </Button>
            {token && <p className="break-all rounded bg-background/60 p-2 font-mono text-[10px]">{token}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={download} disabled={!token}><Download className="mr-2 h-4 w-4" /> Baixar agent.py</Button>
              <Button size="sm" variant="outline" onClick={copy} disabled={!token}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} Copiar script
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Gere o token, baixe o script já com ele e rode: <code>pip install pyautogui requests</code> e <code>python agent.py</code>. Gerar outro token desliga o anterior.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Últimas ações</p>
            {!st?.actions.length && <p className="text-[11px] text-muted-foreground">Nenhuma ação ainda.</p>}
            {st?.actions.map((a) => {
              const p = JSON.parse(a.payload) as Record<string, unknown>;
              const det = (p["text"] ?? p["key"] ?? p["app_name"] ?? p["script"] ?? (p["x"] != null ? `${p["x"]},${p["y"]}` : "")) as string;
              return (
                <div key={a.id} className={cn("flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors", a.status === "running" && "bg-primary/15")}>
                  {a.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  <span className="flex-1 truncate">
                    {ACTION_LABEL[a.action] ?? a.action}{det ? `: ${String(det).slice(0, 40)}` : ""} <span className="text-muted-foreground">· {a.target}</span>
                  </span>
                  {a.status === "pending" ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => decide({ data: { id: a.id, approve: true } })}><Check className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => decide({ data: { id: a.id, approve: false } })}><X className="h-3 w-3" /></Button>
                    </>
                  ) : (
                    <span className={cn("text-[10px]", a.status === "done" ? "text-primary" : "text-muted-foreground")}>
                      {{ approved: "na fila", running: "executando", done: "feito", failed: "falhou", rejected: "bloqueada" }[a.status] ?? a.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
