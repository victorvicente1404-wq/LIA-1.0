import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Link2, Laptop, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { generatePairing, joinWithCode, linkStore, unlinkDevice } from "@/lib/lia/sync/link";

const SERVER_SNAP = linkStore.get();

export function LiaLinkBadge() {
  const s = useSyncExternalStore(linkStore.subscribe, linkStore.get, () => SERVER_SNAP);
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("link");
    if (code && /^\d{6}$/.test(code)) {
      setPrefill(code);
      setOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const label =
    s.status === "syncing" ? "Sincronizando..." : s.status === "active" ? `Lia Link ativo (${s.devices.length})` : "Modo local";
  const dot = s.status === "active" ? "bg-glow" : s.status === "syncing" ? "bg-accent animate-pulse" : "bg-muted-foreground";

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 gap-1.5 rounded-full border border-border px-2.5 text-[11px]" onClick={() => setOpen(true)} title={label}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <Link2 className="h-3.5 w-3.5" />
        <span className="hidden md:inline">{label}</span>
      </Button>
      <LiaLinkDialog open={open} onOpenChange={setOpen} prefill={prefill} />
    </>
  );
}

function LiaLinkDialog({ open, onOpenChange, prefill }: { open: boolean; onOpenChange: (o: boolean) => void; prefill: string }) {
  const s = useSyncExternalStore(linkStore.subscribe, linkStore.get, () => SERVER_SNAP);
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number; qr: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [code, setCode] = useState(prefill);
  const [joinPass, setJoinPass] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setCode(prefill), [prefill]);
  useEffect(() => {
    if (!pairing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pairing]);

  const left = pairing ? Math.max(0, Math.floor((pairing.expiresAt - now) / 1000)) : 0;
  const linked = s.status !== "local";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const generate = () =>
    run(async () => {
      const p = await generatePairing(password);
      const qr = await QRCode.toDataURL(`${window.location.origin}/?link=${p.code}`, { margin: 1, width: 220 });
      setPairing({ ...p, qr });
      setNow(Date.now());
    });

  const join = () =>
    run(async () => {
      await joinWithCode(code, joinPass);
      toast.success("Dispositivos sincronizados!");
      setJoinPass("");
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Lia Link</DialogTitle>
          <DialogDescription>Uma só Lia no PC e no celular: memórias, conversas, APIs e preferências sincronizadas e cifradas com a sua senha.</DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="rounded-lg border border-border p-3 text-sm">
            Entre na sua conta para parear dispositivos.{" "}
            <a href="/auth" className="text-glow underline">Entrar</a>
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            {linked && (
              <section className="space-y-2">
                <h3 className="text-xs uppercase text-muted-foreground">Dispositivos conectados</h3>
                {s.devices.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    {d.kind === "mobile" ? <Smartphone className="h-4 w-4 text-glow" /> : <Laptop className="h-4 w-4 text-glow" />}
                    <span className="flex-1 truncate">{d.name}{d.id === s.deviceId ? " (este)" : ""}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Desvincular" onClick={() => run(() => unlinkDevice(d.id))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {s.error && <p className="text-xs text-destructive">Falha ao sincronizar; tentando de novo. ({s.error})</p>}
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-xs uppercase text-muted-foreground">Parear outro dispositivo</h3>
              {!linked && (
                <Input type="password" placeholder="Crie uma senha de sincronização (mín. 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
              <Button className="w-full" disabled={busy || (!linked && password.length < 6)} onClick={generate}>
                Gerar código de pareamento
              </Button>
              {pairing && left > 0 && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <img src={pairing.qr} alt="QR Code de pareamento" className="h-44 w-44 rounded" />
                  <div className="font-display text-3xl tracking-[0.35em] text-gradient-lia">{pairing.code}</div>
                  <p className="text-xs text-muted-foreground">
                    Expira em {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} · no outro aparelho use a mesma senha
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs uppercase text-muted-foreground">Conectar a outro dispositivo</h3>
              <p className="text-xs text-muted-foreground">Leia o QR com a câmera do celular ou digite o código.</p>
              <Input inputMode="numeric" maxLength={6} placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <Input type="password" placeholder="Senha de sincronização" value={joinPass} onChange={(e) => setJoinPass(e.target.value)} />
              <Button variant="secondary" className="w-full" disabled={busy || code.length !== 6 || !joinPass} onClick={join}>
                Sincronizar dispositivos
              </Button>
            </section>

            <p className="text-[11px] text-muted-foreground">
              As contas do Google não são copiadas: entre na mesma conta nos dois aparelhos e elas já funcionam. Sem a senha ninguém lê os dados na nuvem.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
