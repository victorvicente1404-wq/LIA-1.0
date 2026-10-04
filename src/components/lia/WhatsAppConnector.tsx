import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  readWhatsAppConfig,
  testConnection,
  writeWhatsAppConfig,
  type WhatsAppConfig,
} from "@/lib/lia/whatsappService";

export function WhatsAppConnector() {
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [status, setStatus] = useState<"unknown" | "on" | "off">("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => setCfg(readWhatsAppConfig()), []);
  if (!cfg) return null;

  const set = (patch: Partial<WhatsAppConfig>) => setCfg({ ...cfg, ...patch });

  async function saveAndTest() {
    if (!cfg) return;
    writeWhatsAppConfig(cfg);
    setBusy(true);
    try {
      const r = await testConnection(cfg);
      setStatus(r.connected ? "on" : "off");
      if (r.connected) toast.success("WhatsApp conectado.");
      else toast.error(`Instância não está conectada (estado: ${r.state}). Leia o QR code na Evolution.`);
    } catch (err) {
      setStatus("off");
      toast.error(err instanceof Error ? err.message : "Não consegui falar com o WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">WhatsApp (Evolution API)</p>
        <span className="text-xs">
          {status === "on" ? "🟢 Conectado" : status === "off" ? "🔴 Desconectado" : "⚪ Não testado"}
        </span>
      </div>
      <Input
        placeholder="URL da API (https://...)"
        value={cfg.url}
        onChange={(e) => set({ url: e.target.value })}
      />
      <Input
        type="password"
        placeholder="API Key"
        value={cfg.apiKey}
        onChange={(e) => set({ apiKey: e.target.value })}
      />
      <Input
        placeholder="Nome da instância"
        value={cfg.instance}
        onChange={(e) => set({ instance: e.target.value })}
      />
      <Input
        placeholder="Palavras importantes (separadas por vírgula; vazio = todas)"
        value={cfg.keywords}
        onChange={(e) => set({ keywords: e.target.value })}
      />
      <label className="flex items-center justify-between text-xs text-muted-foreground">
        Avisar novas mensagens (a cada 10s)
        <Switch checked={cfg.watch} onCheckedChange={(v) => set({ watch: v })} />
      </label>
      <Button size="sm" onClick={saveAndTest} disabled={busy || !cfg.url || !cfg.apiKey}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Salvar e testar conexão
      </Button>
      <p className="text-[11px] text-muted-foreground">
        A chave fica guardada só neste navegador.
      </p>
    </div>
  );
}
