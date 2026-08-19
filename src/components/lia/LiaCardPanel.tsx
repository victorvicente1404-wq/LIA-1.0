import { Cpu, Download, HardDriveDownload, Plug, Unplug, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLia } from "@/lib/lia/LiaProvider";
import * as card from "@/lib/lia/card-storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Representação visual do dispositivo portátil da Lia. */
export function LiaCardPanel() {
  const { cardConnected, cardPresent, data, connectCard, ejectCard, createCard, wipeCard } =
    useLia();

  const download = () => {
    const blob = new Blob([card.exportCard()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lia-card-${data?.cardId ?? "backup"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = (file: File) => {
    void file.text().then((text) => {
      try {
        card.importCard(text);
        connectCard();
        toast.success("Lia Card restaurado");
      } catch {
        toast.error("Arquivo de Lia Card inválido");
      }
    });
  };

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border p-5",
          cardConnected ? "border-primary/60 glow" : "border-border opacity-80",
        )}
        style={{ backgroundImage: "var(--gradient-panel)" }}
      >
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-lia opacity-20 blur-2xl" />
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Lia Card
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-gradient-lia">
              {data?.cardName ?? "Sem cartão"}
            </p>
          </div>
          <Cpu className={cn("h-8 w-8", cardConnected ? "text-glow" : "text-muted-foreground")} />
        </div>
        <div className="mt-6 flex items-end justify-between">
          <div className="font-mono text-xs text-muted-foreground">
            ID {data?.cardId ?? "— — — —"}
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest",
              cardConnected
                ? "bg-primary/20 text-glow"
                : "bg-muted text-muted-foreground",
            )}
          >
            {cardConnected ? "conectado" : "não conectado"}
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        O computador fornece o corpo e o poder de processamento. O Lia Card fornece identidade,
        memória e personalização. Ao levar o cartão para outro computador, a mesma Lia é carregada —
        perfis, memória, personalidade e módulos.
      </p>

      {cardConnected && data && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Perfis" value={String(data.profiles.length)} />
          <Stat
            label="Memórias"
            value={String(data.profiles.reduce((n, p) => n + p.memory.length, 0))}
          />
          <Stat label="Mensagens" value={String(data.history.length)} />
          <Stat label="Módulos ativos" value={String(data.modules.filter((m) => m.ativo).length)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {cardConnected ? (
          <Button variant="secondary" size="sm" onClick={ejectCard}>
            <Unplug className="mr-1.5 h-3.5 w-3.5" /> Remover com segurança
          </Button>
        ) : cardPresent ? (
          <Button size="sm" onClick={connectCard}>
            <Plug className="mr-1.5 h-3.5 w-3.5" /> Conectar Lia Card
          </Button>
        ) : (
          <Button size="sm" onClick={() => createCard("Lia Card")}>
            <HardDriveDownload className="mr-1.5 h-3.5 w-3.5" /> Criar Lia Card
          </Button>
        )}
        {cardConnected && (
          <Button variant="ghost" size="sm" onClick={download}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
          </Button>
        )}
        <label className="inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Importar
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        {cardPresent && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={wipeCard}>
            Apagar cartão
          </Button>
        )}
      </div>

      {!cardConnected && (
        <p className="rounded-md border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
          Sem o Lia Card a aplicação continua funcionando, mas os dados pessoais portáteis —
          memória, perfis e personalidade — não ficam disponíveis.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface/60 px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-display text-lg">{value}</p>
    </div>
  );
}
