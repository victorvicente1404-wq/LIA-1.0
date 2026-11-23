import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkLocalEngine, readLocalEngineUrl, writeLocalEngineUrl } from "@/lib/lia/termux-llm";
import { toast } from "sonner";

export function LocalEngineSettings() {
  const [endpoint, setEndpoint] = useState(() => readLocalEngineUrl());
  const [status, setStatus] = useState("Ainda não testado.");
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  const save = () => {
    try {
      const saved = writeLocalEngineUrl(endpoint);
      setEndpoint(saved);
      toast.success("Endereço do motor local salvo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Endereço inválido.");
    }
  };

  const test = async () => {
    setChecking(true);
    setStatus("Verificando llama-server…");
    const result = await checkLocalEngine(endpoint);
    setConnected(result.ok);
    setStatus(result.detail);
    setChecking(false);
  };

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-surface/60 p-3">
      <div>
        <p className="text-sm font-medium">Motor principal · llama.cpp</p>
        <p className="text-xs text-muted-foreground">
          A conversa usa o servidor local no Termux. A seleção automática entre motor local e provedor online ainda não está implementada nesta versão.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="lia-local-endpoint">Endereço local</label>
        <Input
          id="lia-local-endpoint"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="http://127.0.0.1:8080"
          className="h-9 font-mono text-xs"
          inputMode="url"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={save}>Salvar endereço</Button>
        <Button size="sm" onClick={test} disabled={checking}>
          {checking ? "Testando…" : "Testar conexão"}
        </Button>
      </div>
      <p className={`text-xs ${connected === true ? "text-primary" : connected === false ? "text-destructive" : "text-muted-foreground"}`} role="status">
        {status}
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Mantenha o Termux aberto com o llama-server em execução. O modelo atual é somente texto; visão e ferramentas de IA serão integradas em etapas próprias.
      </p>
    </div>
  );
}
