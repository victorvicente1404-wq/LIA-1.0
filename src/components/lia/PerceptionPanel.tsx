import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Eye, Mic, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiaOrb, stateLabel } from "./LiaOrb";
import { useLia } from "@/lib/lia/LiaProvider";
import { cn } from "@/lib/utils";
import { visionSource } from "@/lib/lia/vision";

/**
 * Área de percepção — o sistema de visão e escuta da Lia.
 * A câmera aqui não é uma webcam comum: é o sentido visual da Lia.
 */
export function PerceptionPanel({
  listening,
  speaking,
  audioLevel = 0,
}: {
  listening: boolean;
  speaking: boolean;
  audioLevel?: number;
}) {
  const { state, modules, settings, updateSettings } = useLia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [presence, setPresence] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevSampleRef = useRef<Uint8ClampedArray | null>(null);

  const visionEnabled = modules.find((m) => m.id === "visao")?.ativo ?? false;

  /** Captura real do frame atual: vídeo → canvas → JPEG. */
  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    const w = 640;
    const h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.72),
      width: w,
      height: h,
      capturedAt: Date.now(),
    };
  }, []);

  useEffect(() => {
    visionSource.setProvider(grabFrame);
    return () => visionSource.setProvider(null);
  }, [grabFrame]);

  // Percepção contínua: amostra a cena e mede variação (presença/movimento).
  useEffect(() => {
    if (!cameraOn) return;
    setAnalyzing(true);
    const interval = setInterval(() => {
      const frame = grabFrame();
      if (!frame) return;
      setAnalyzing(false);
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const small = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // amostragem esparsa em luminância
      const step = Math.max(4, Math.floor(small.data.length / (4 * 1200))) * 4;
      const sample = new Uint8ClampedArray(Math.ceil(small.data.length / step));
      let si = 0;
      for (let i = 0; i < small.data.length; i += step) {
        sample[si++] =
          (small.data[i]! * 0.299 + small.data[i + 1]! * 0.587 + small.data[i + 2]! * 0.114) | 0;
      }
      const prev = prevSampleRef.current;
      let change = 0;
      if (prev && prev.length === sample.length) {
        let diff = 0;
        for (let i = 0; i < sample.length; i++) diff += Math.abs(sample[i]! - prev[i]!);
        change = Math.min(1, diff / (sample.length * 255) / 0.08);
      }
      prevSampleRef.current = sample;
      const detected = change > 0.05;
      setPresence((p) => (detected ? true : change < 0.01 ? p : p));
      visionSource.pushFrame(frame, change, detected || presence);
    }, 1200);
    return () => clearInterval(interval);
  }, [cameraOn, grabFrame, presence]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    prevSampleRef.current = null;
    setCameraOn(false);
    setPresence(false);
    visionSource.setStatus("desligada");
    updateSettings({ camera: false });
  };

  const startCamera = async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
      visionSource.setStatus("ativa");
      updateSettings({ camera: true });
    } catch {
      setErro("Não consegui acessar a câmera. Verifique a permissão do navegador.");
      visionSource.setStatus("indisponivel", "sem permissão");
    }
  };

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      visionSource.setStatus("desligada");
    },
    [],
  );

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
