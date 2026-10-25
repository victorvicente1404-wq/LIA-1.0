import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadLocalLlm, localLlmEnabled, localLlmSupported, setLocalLlmEnabled } from "@/lib/lia/local-llm";

export function LocalModelToggle() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    setOn(localLlmEnabled());
    setSupported(localLlmSupported());
  }, []);

  const ativar = async () => {
    setLocalLlmEnabled(true);
    setOn(true);
    setProgress(0);
    try {
      await loadLocalLlm((p) => setProgress(Math.round(p * 100)));
      toast.success("Modelo local pronto. Funciona mesmo sem cotas.");
    } catch (e) {
      toast.error(`Não consegui carregar o modelo local: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Modelo local (reserva sem limites)</p>
        <span className={on ? "text-xs text-primary" : "text-xs text-muted-foreground"}>{on ? "ativo" : "desligado"}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        IA pequena que roda dentro deste aparelho, sem chave e sem cotas. Baixa ~400 MB uma vez. Responde quando as outras falham; não aciona ferramentas.
      </p>
      {!supported && <p className="text-xs text-destructive">Este navegador não tem WebGPU (use Chrome atualizado).</p>}
      {progress !== null && <p className="text-xs text-primary">Baixando… {progress}%</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!supported || progress !== null} onClick={ativar}>
          {on ? "Carregar agora" : "Ativar e baixar"}
        </Button>
        {on && (
          <Button size="sm" variant="ghost" onClick={() => { setLocalLlmEnabled(false); setOn(false); }}>
            Desligar
          </Button>
        )}
      </div>
    </div>
  );
}
