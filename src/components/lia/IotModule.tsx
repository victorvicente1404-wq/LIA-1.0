import { useEffect, useState } from "react";
import { connectSerial, disconnectSerial, onSerialChange, sendSerial, serialConnected, serialSupported } from "@/lib/lia/webserial";
import { Check, Copy, Cpu, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLia } from "@/lib/lia/LiaProvider";
import { ARDUINO_SKETCH, ESP32_SKETCH, PYTHON_BRIDGE } from "@/lib/lia/iot";
import { iotTest } from "@/lib/lia/iot.functions";
import { cn } from "@/lib/utils";

const CODES = [
  { id: "esp32", label: "ESP32 (C++)", code: ESP32_SKETCH },
  { id: "uno", label: "Arduino Uno (sketch)", code: ARDUINO_SKETCH },
  { id: "py", label: "Ponte Python", code: PYTHON_BRIDGE },
] as const;

export function IotModule() {
  const { iot, saveIot } = useLia();
  const [url, setUrl] = useState(iot.url);
  const [token, setToken] = useState(iot.token);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [detail, setDetail] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [tab, setTab] = useState<(typeof CODES)[number]["id"]>("esp32");
  const [copied, setCopied] = useState(false);

  const [usbOn, setUsbOn] = useState(false);
  const [usbMsg, setUsbMsg] = useState("");
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(serialSupported());
    setUsbOn(serialConnected());
    const off = onSerialChange(() => setUsbOn(serialConnected()));
    return () => { off(); };
  }, []);
  const toggleUsb = async () => {
    setUsbMsg("");
    try {
      if (usbOn) return void (await disconnectSerial());
      await connectSerial();
      const r = await sendSerial({ action: "digital_write", pin: 13, value: 1 });
      setTimeout(() => void sendSerial({ action: "digital_write", pin: 13, value: 0 }).catch(() => null), 600);
      setUsbMsg(r === "1" ? "LED 13 piscou — tudo certo!" : `Resposta: ${r}`);
    } catch (e) {
      setUsbMsg((e as Error).name === "NotFoundError" ? "Nenhuma porta escolhida." : (e as Error).message);
    }
  };

  const test = async () => {
    const cfg = { url: url.trim(), token: token.trim() };
    saveIot(cfg);
    if (!cfg.url) return;
    setStatus("testing");
    try {
      const r = await iotTest({ data: cfg });
      setStatus(r.ok ? "ok" : "fail");
      setDetail(r.ok ? `Respondeu em ${r.ms} ms` : typeof r.body === "string" ? r.body.slice(0, 160) : `HTTP ${r.status}`);
    } catch {
      setStatus("fail");
      setDetail("Endereço inválido. Use http(s)://…");
    }
  };

  const current = CODES.find((c) => c.id === tab)!;

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="space-y-2 rounded-md bg-surface-2 p-3">
        <p className="text-xs font-medium">Arduino Uno pelo cabo USB</p>
        {supported ? (
          <>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={toggleUsb} variant={usbOn ? "outline" : "default"}>
                <Usb className="mr-2 h-4 w-4" /> {usbOn ? "Desconectar" : "Conectar via USB"}
              </Button>
              <span className="text-xs">{usbOn ? "🟢 Conectado" : "⚪ Desligado"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Grave o sketch "Arduino Uno" (abaixo), clique em conectar e escolha a porta. Feche o Monitor Serial da Arduino IDE antes.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Seu navegador não suporta USB. Use Chrome ou Edge no computador.</p>
        )}
        {usbMsg && <p className="text-[11px] text-muted-foreground">{usbMsg}</p>}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Endereço do dispositivo / ponte</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seu-tunel.ngrok-free.app" />
        <p className="text-[11px] text-muted-foreground">
          Use um endereço público (ngrok, Cloudflare Tunnel). IPs da rede local não são acessíveis pela Lia.
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Token (opcional)</Label>
        <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="mesmo token do código" />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={test} disabled={status === "testing" || !url.trim()}>
          {status === "testing" ? "Testando…" : "Ping / Testar"}
        </Button>
        <span className="text-xs">
          {status === "ok" ? "🟢 Conectado" : status === "fail" ? "🔴 Sem resposta" : "⚪ Não testado"}
        </span>
      </div>
      {detail && <p className="text-[11px] text-muted-foreground break-words">{detail}</p>}

      <Button size="sm" variant="outline" className="w-full" onClick={() => setShowCode((v) => !v)}>
        <Cpu className="mr-2 h-4 w-4" /> {showCode ? "Ocultar" : "Código do dispositivo"}
      </Button>
      {showCode && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {CODES.map((c) => (
              <button
                key={c.id}
                onClick={() => setTab(c.id)}
                className={cn(
                  "rounded px-2 py-1 text-[11px]",
                  tab === c.id ? "bg-primary/20 text-primary" : "bg-surface-2 text-muted-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1 h-7 w-7"
              aria-label="Copiar código"
              onClick={() => {
                void navigator.clipboard.writeText(current.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <pre className="max-h-72 overflow-auto rounded-md bg-surface-2 p-3 text-[10px] leading-relaxed">
              <code>{current.code}</code>
            </pre>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Arduino Uno: basta gravar o sketch e usar "Conectar via USB". A ponte Python só é necessária para controlar o Uno de outro computador.
          </p>
        </div>
      )}
    </div>
  );
}
