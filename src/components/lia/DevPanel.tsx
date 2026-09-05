import { useEffect, useState } from "react";
import { Download, Lock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLia } from "@/lib/lia/LiaProvider";
import * as card from "@/lib/lia/card-storage";
import { mergeCardData } from "@/lib/lia/card-merge";
import {
  DEV_PASSWORD,
  readDevSettings,
  writeDevSettings,
  type DevSettings,
} from "@/lib/lia/dev-settings";
import type { LiaCardData } from "@/lib/lia/types";

export function DevPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const lia = useLia();
  const [unlocked, setUnlocked] = useState(false);
  const [senha, setSenha] = useState("");
  const [settings, setSettings] = useState<DevSettings>(readDevSettings());

  useEffect(() => {
    if (open) {
      setSettings(readDevSettings());
      setSenha("");
    } else {
      setUnlocked(false);
    }
  }, [open]);

  const save = (patch: Partial<DevSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeDevSettings(next);
  };

  const exportJson = () => {
    const data = card.readCard();
    if (!data) {
      toast.error("Nenhum Lia Card conectado para exportar.");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lia-card-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exportado.");
  };

  const importJson = async (file: File) => {
    try {
      const incoming = JSON.parse(await file.text()) as LiaCardData;
      const current = card.readCard();
      const merged = current ? mergeCardData(current, incoming) : incoming;
      card.writeCard(merged);
      card.mount();
      lia.connectCard();
      toast.success("Dados mesclados com sucesso.");
    } catch (error) {
      toast.error(`Arquivo inválido: ${(error as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Lock className="h-4 w-4" /> Painel interno da Lia
          </DialogTitle>
          <DialogDescription>
            {unlocked ? "Área restrita de configuração e diagnóstico." : "Digite a senha para continuar."}
          </DialogDescription>
        </DialogHeader>

        {!unlocked ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (senha === DEV_PASSWORD) setUnlocked(true);
              else toast.error("Senha incorreta.");
            }}
          >
            <Input
              autoFocus
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Senha"
            />
            <Button type="submit">Entrar</Button>
          </form>
        ) : (
          <div className="space-y-5 text-sm">
            <div className="space-y-1.5">
              <Label>E-mail da Lia</Label>
              <Input value={settings.email} onChange={(e) => save({ email: e.target.value })} />
              <p className="text-[11px] text-muted-foreground">
                Conta usada pela Lia para enviar e receber mensagens em nome dela.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Instruções extras de sistema</Label>
              <Textarea
                rows={5}
                value={settings.systemPromptExtra}
                onChange={(e) => save({ systemPromptExtra: e.target.value })}
                placeholder="Texto acrescentado ao comportamento base da Lia…"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="font-medium">Modo de diagnóstico</p>
                <p className="text-[11px] text-muted-foreground">
                  Mostra detalhes técnicos no console do navegador.
                </p>
              </div>
              <Switch checked={settings.debug} onCheckedChange={(v) => save({ debug: v })} />
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="font-medium">Backup completo (JSON)</p>
              <p className="text-[11px] text-muted-foreground">
                A importação mescla: memórias novas são acrescentadas, nada é sobrescrito.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={exportJson}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <label className="cursor-pointer">
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Importar
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importJson(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border p-3 text-[11px] text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Diagnóstico</p>
              <p>Lia Card: {lia.cardConnected ? "conectado" : "desconectado"}</p>
              <p>Perfil ativo: {lia.profile.nome}</p>
              <p>Memórias: {lia.memory.length}</p>
              <p>Mensagens na conversa: {lia.messages.length}</p>
              <p>Módulos ativos: {lia.modules.filter((m) => m.ativo).length}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
