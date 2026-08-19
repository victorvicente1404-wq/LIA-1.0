import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Eye, Mic, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiaOrb, stateLabel } from "./LiaOrb";
import { useLia } from "@/lib/lia/LiaProvider";
import { cn } from "@/lib/utils";

/**
 * Área de percepção — o sistema de visão e escuta da Lia.
 * A câmera aqui não é uma webcam comum: é o sentido visual da Lia.
 */
export function PerceptionPanel({
  listening,
  speaking,
}: {
  listening: boolean;
  speaking: boolean;
}) {
  const { state, modules, settings, updateSettings } = useLia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [presence, setPresence] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const visionEnabled = modules.find((m) => m.id === "visao")?.ativo ?? false;

  useEffect(() => {
    if (!cameraOn) return;
    setAnalyzing(true);
    const t1 = setTimeout(() => setAnalyzing(false), 1800);
    const t2 = setTimeout(() => setPresence(true), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [cameraOn]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setPresence(false);
    updateSettings({ camera: false });
  };

  const startCamera = async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
      updateSettings({ camera: true });
    } catch {
      setErro("Não consegui acessar a câmera. Verifique a permissão do navegador.");
    }
  };

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const visionStatus = !cameraOn
    ? "Visão desligada"
    : analyzing
      ? "Analisando ambiente"
      : presence
        ? "Pessoa detectada"
        : "Observando";

  return (
    <aside className="panel flex w-full flex-col gap-4 p-4 lg:w-80">
      <div className="flex items-center gap-3">
        <LiaOrb state={listening ? "listening" : speaking ? "speaking" : state} size={52} />
        <div>
          <p className="font-display text-sm font-semibold">Percepção</p>
          <p className="text-xs text-muted-foreground">
            Estado:{" "}
            <span className="text-primary">
              {stateLabel(listening ? "listening" : speaking ? "speaking" : state)}
            </span>
          </p>
        </div>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black/60">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn("h-full w-full object-cover", !cameraOn && "hidden")}
        />
        {!cameraOn && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <CameraOff className="h-6 w-6" />
            <span className="text-xs">Sistema de visão desligado</span>
          </div>
        )}
        {cameraOn && (
          <>
            <div className="pointer-events-none absolute inset-0 border-2 border-primary/30" />
            {presence && !analyzing && (
              <div className="pointer-events-none absolute left-1/4 top-1/5 h-1/2 w-1/2 rounded-md border-2 border-glow/80 shadow-[0_0_24px_-6px_var(--glow)]">
                <span className="absolute -top-6 left-0 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] text-primary-foreground">
                  usuário detectado
                </span>
              </div>
            )}
            <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-background/70 px-2 py-1 text-[10px] uppercase tracking-widest text-glow">
              <Eye className="h-3 w-3" /> {visionStatus}
            </span>
          </>
        )}
      </div>

      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {!visionEnabled && (
        <p className="text-xs text-muted-foreground">
          O módulo Visão está inativo. Ative-o em Módulos para a Lia usar a câmera plenamente.
        </p>
      )}

      <Button
        variant={cameraOn ? "secondary" : "default"}
        className="w-full"
        onClick={cameraOn ? stopCamera : startCamera}
      >
        {cameraOn ? <CameraOff className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
        {cameraOn ? "Desligar visão" : "Ligar visão"}
      </Button>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <StatusChip
          icon={<ScanFace className="h-3.5 w-3.5" />}
          label="Presença"
          value={presence ? "detectada" : "nenhuma"}
          active={presence}
        />
        <StatusChip
          icon={<Mic className="h-3.5 w-3.5" />}
          label="Escuta"
          value={listening ? "ouvindo" : settings.microfone ? "pronta" : "inativa"}
          active={listening}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Reconhecimento facial, identificação de objetos e leitura de ambiente estão previstos como
        módulos futuros do sistema de visão.
      </p>
    </aside>
  );
}

function StatusChip({
  icon,
  label,
  value,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-surface/60 px-2 py-1.5",
        active && "border-primary/60 text-glow",
      )}
    >
      {icon}
      <div className="leading-tight">
        <p className="text-muted-foreground">{label}</p>
        <p className={cn("font-medium", active && "text-glow")}>{value}</p>
      </div>
    </div>
  );
}
