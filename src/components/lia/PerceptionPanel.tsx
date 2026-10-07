import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Eye, Mic, Monitor, ScanFace, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { averageDescriptor, detectFaces, loadFaceApi, type FaceHit } from "@/lib/lia/faces";
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
  compact = false,
}: {
  listening: boolean;
  speaking: boolean;
  audioLevel?: number;
  compact?: boolean;
}) {
  const { state, modules, settings, updateSettings, faces, saveFaces, user } = useLia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [source, setSource] = useState<"camera" | "tela" | null>(null);
  const cameraOn = source !== null;
  const [loadingModel, setLoadingModel] = useState(false);
  const [hits, setHits] = useState<FaceHit[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const facesRef = useRef(faces);
  facesRef.current = faces;
  const hitsRef = useRef<FaceHit[]>([]);

  const visionEnabled = modules.find((m) => m.id === "visao")?.ativo ?? false;
  const presence = hits.length > 0;

  /** Captura real do frame atual: vídeo → canvas → JPEG. */
  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    const w = source === "tela" ? 1024 : 640;
    const h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.72), width: w, height: h, capturedAt: Date.now() };
  }, [source]);

  useEffect(() => {
    visionSource.setProvider(grabFrame);
    return () => visionSource.setProvider(null);
  }, [grabFrame]);

  // Detecção facial real + reconhecimento (só na câmera).
  useEffect(() => {
    if (!cameraOn) return;
    let stop = false;
    let busy = false;
    if (source === "camera") {
      setLoadingModel(true);
      loadFaceApi()
        .catch(() => setErro("Não consegui carregar o reconhecimento facial. Verifique a internet."))
        .finally(() => setLoadingModel(false));
    }
    const tick = async () => {
      const video = videoRef.current;
      const frame = grabFrame();
      if (frame) visionSource.pushFrame(frame, 0, hitsRef.current.length > 0);
      if (source !== "camera" || !video || !video.videoWidth || busy) {
        if (source === "tela") visionSource.setFaces(undefined, "tela");
        return;
      }
      busy = true;
      try {
        const res = await detectFaces(video, facesRef.current);
        if (stop) return;
        hitsRef.current = res;
        setHits(res);
        const nomes = [...new Set(res.flatMap((r) => (r.nome ? [r.nome] : [])))];
        visionSource.setFaces({ count: res.length, nomes, desconhecidos: res.filter((r) => !r.nome).length }, "camera");
        drawOverlay(overlayRef.current, video, res);
      } catch {
        /* modelo ainda carregando */
      } finally {
        busy = false;
      }
    };
    const id = setInterval(() => void tick(), 400);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [cameraOn, source, grabFrame]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    hitsRef.current = [];
    setHits([]);
    setSource(null);
    drawOverlay(overlayRef.current, null, []);
    visionSource.setStatus("desligada");
    updateSettings({ camera: false });
  };

  const attach = (stream: MediaStream, kind: "camera" | "tela") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    stream.getVideoTracks()[0]?.addEventListener("ended", stopCamera);
    setSource(kind);
    visionSource.setStatus("ativa");
    updateSettings({ camera: true });
  };

  const startCamera = async () => {
    setErro(null);
    try {
      attach(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }), "camera");
    } catch {
      setErro("Não consegui acessar a câmera. Verifique a permissão do navegador.");
      visionSource.setStatus("indisponivel", "sem permissão");
    }
  };

  const screenSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const startScreen = async () => {
    setErro(null);
    try {
      attach(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }), "tela");
    } catch {
      setErro("Compartilhamento de tela cancelado ou não suportado neste aparelho.");
    }
  };

  const enroll = async () => {
    const video = videoRef.current;
    if (!video) return;
    const nome = window.prompt("Nome de quem está na câmera:", user.nome || "")?.trim();
    if (!nome) return;
    setEnrolling(true);
    setErro(null);
    try {
      const samples: Float32Array[] = [];
      for (let i = 0; i < 12 && samples.length < 4; i++) {
        const res = await detectFaces(video, []);
        if (res.length === 1) samples.push(res[0]!.descriptor);
        await new Promise((r) => setTimeout(r, 350));
      }
      if (samples.length < 2) {
        setErro("Não vi um único rosto com clareza. Fique sozinho na frente da câmera, com boa luz.");
        return;
      }
      saveFaces([...faces.filter((f) => f.nome !== nome), { nome, descriptor: averageDescriptor(samples) }]);
      toast.success(`Rosto de ${nome} cadastrado no Lia Card.`);
    } finally {
      setEnrolling(false);
    }
  };

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      visionSource.setStatus("desligada");
    },
    [],
  );

  const known = hits.filter((h) => h.nome);
  const visionStatus = !cameraOn
    ? "Visão desligada"
    : source === "tela"
      ? "Vendo sua tela"
      : loadingModel
        ? "Carregando visão facial"
        : known.length
          ? `${known.map((k) => k.nome).join(", ")} identificado`
          : presence
            ? `${hits.length} pessoa(s) · visitante`
            : "Observando";

  return (
    <aside className={cn("panel flex w-full flex-col gap-4 p-4", !compact && "lg:w-80", compact && "gap-3 p-3")}>
      {!compact && (
        <div className="flex items-center gap-3">
          <LiaOrb state={listening ? "listening" : speaking ? "speaking" : state} size={52} />
          <div>
            <p className="font-display text-sm font-semibold">Percepção</p>
            <p className="text-xs text-muted-foreground">
              Estado:{" "}
              <span className="text-primary">{stateLabel(listening ? "listening" : speaking ? "speaking" : state)}</span>
            </p>
          </div>
        </div>
      )}

      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-background">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn("h-full w-full", source === "tela" ? "object-contain" : "object-cover", !cameraOn && "hidden")}
        />
        <canvas ref={overlayRef} className={cn("pointer-events-none absolute inset-0 h-full w-full", source !== "camera" && "hidden")} />
        {!cameraOn && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <CameraOff className="h-6 w-6" />
            <span className="text-xs">Sistema de visão desligado</span>
          </div>
        )}
        {cameraOn && (
          <>
            <div className="pointer-events-none absolute inset-0 border-2 border-primary/30" />
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

      <div className="grid grid-cols-2 gap-2">
        <Button variant={source === "camera" ? "secondary" : "default"} onClick={source === "camera" ? stopCamera : startCamera}>
          {source === "camera" ? <CameraOff className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
          {source === "camera" ? "Desligar" : "Câmera"}
        </Button>
        <Button variant={source === "tela" ? "secondary" : "outline"} disabled={!screenSupported} onClick={source === "tela" ? stopCamera : startScreen} title={screenSupported ? "" : "Este aparelho não permite compartilhar a tela"}>
          <Monitor className="mr-2 h-4 w-4" />
          {source === "tela" ? "Parar tela" : "Ver tela"}
        </Button>
      </div>

      {source === "camera" && (
        <div className="space-y-2">
          <Button variant="outline" className="w-full" disabled={enrolling || loadingModel} onClick={enroll}>
            <UserPlus className="mr-2 h-4 w-4" />
            {enrolling ? "Olhe para a câmera…" : "Cadastrar meu rosto"}
          </Button>
          {faces.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {faces.map((f) => (
                <span key={f.nome} className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-glow">
                  {f.nome}
                  <button type="button" aria-label={`Remover ${f.nome}`} onClick={() => saveFaces(faces.filter((x) => x.nome !== f.nome))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <StatusChip icon={<ScanFace className="h-3.5 w-3.5" />} label="Rostos" value={presence ? `${hits.length} · ${known.length} conhecido(s)` : "nenhum"} active={presence} />
        <StatusChip icon={<Mic className="h-3.5 w-3.5" />} label="Escuta" value={listening ? "ouvindo" : settings.microfone ? "pronta" : "inativa"} active={listening} />
      </div>

      {!compact && (listening || audioLevel > 0) && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-glow transition-[width] duration-75" style={{ width: `${Math.min(100, Math.round(audioLevel * 320))}%` }} />
          </div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">nível do microfone</p>
        </div>
      )}

      {!compact && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          O reconhecimento roda só neste aparelho. Apenas uma assinatura numérica do rosto vai para o Lia Card, nunca a foto.
        </p>
      )}
    </aside>
  );
}

/** Desenha marcações neon nos rostos, acompanhando o object-cover do vídeo. */
function drawOverlay(canvas: HTMLCanvasElement | null, video: HTMLVideoElement | null, hits: FaceHit[]) {
  if (!canvas) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, cw, ch);
  if (!video || !video.videoWidth) return;
  const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
  const ox = (cw - video.videoWidth * scale) / 2, oy = (ch - video.videoHeight * scale) / 2;
  const css = getComputedStyle(canvas);
  const glow = css.getPropertyValue("--glow").trim() || "currentColor";
  const warn = css.getPropertyValue("--primary").trim() || glow;
  for (const h of hits) {
    const x = h.box.x * scale + ox, y = h.box.y * scale + oy, w = h.box.width * scale, hh = h.box.height * scale;
    const color = h.nome ? glow : warn;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    const c = Math.min(w, hh) * 0.25;
    ctx.beginPath();
    for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + hh, 1, -1], [x + w, y + hh, -1, -1]] as const) {
      ctx.moveTo(px + dx * c, py);
      ctx.lineTo(px, py);
      ctx.lineTo(px, py + dy * c);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    const label = h.nome ? `${h.nome} · ${Math.round((1 - (h.distance ?? 0)) * 100)}%` : `visitante · ${Math.round(h.score * 100)}%`;
    ctx.font = "600 11px ui-sans-serif, system-ui";
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - 18), tw, 16);
    ctx.fillStyle = css.getPropertyValue("--background").trim() || "black";
    ctx.fillText(label, x + 5, Math.max(12, y - 6));
  }
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
