import { useEffect, useRef, useState } from "react";
import { Camera, Cookie, LoaderCircle, Mic, Paperclip, Send, Square, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LiaOrb, stateLabel } from "./LiaOrb";
import { Markdown } from "./Markdown";
import { AttachmentCard, AttachmentPreview } from "./AttachmentView";
import { useLia } from "@/lib/lia/LiaProvider";
import type { Attachment } from "@/lib/lia/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { prepareFiles } from "@/lib/lia/media";

export function ChatPanel({
  listening,
  micOn,
  micState,
  speaking,
  onMic,
  onStopSpeech,
  micSupported,
  onCameraFocus,
  onTreat,
}: {
  listening: boolean;
  micOn: boolean;
  micState: "off" | "sleeping" | "active" | "hearing" | "processing" | "speaking";
  speaking: boolean;
  onMic: () => void;
  onStopSpeech: () => void;
  micSupported: boolean;
  onCameraFocus: () => void;
  onTreat: () => void;
}) {
  const { messages, send, sending, stop, state, profile, clearHistory } = useLia();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const readFiles = async (files: FileList) => {
    setPreparing(true);
    try {
      const next = await prepareFiles(files);
      setPending((prev) => [...prev, ...next].slice(0, 6));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const submit = () => {
    const text = draft;
    const anexos = pending;
    if (!text.trim() && !anexos.length) return;
    setDraft("");
    setPending([]);
    if (fileRef.current) fileRef.current.value = "";
    void send(text, anexos);
  };

  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <LiaOrb state={listening ? "listening" : speaking ? "speaking" : state} size={38} />
          <div>
            <p className="font-display text-sm font-semibold">Conversa com a Lia</p>
            <p className="text-[11px] text-muted-foreground">
              Perfil {profile.nome} ·{" "}
              {stateLabel(listening ? "listening" : speaking ? "speaking" : state)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
            {micState === "off"
              ? "microfone desligado"
              : micState === "sleeping"
                ? "aguardando palavra de ativação"
                : micState === "hearing"
                  ? "ouvindo"
                  : micState === "processing"
                    ? "processando"
                    : micState === "speaking"
                      ? "lia falando"
                      : "microfone ativo"}
          </span>
          {speaking && (
            <Button size="sm" variant="secondary" onClick={onStopSpeech}>
              <Volume2 className="mr-1.5 h-3.5 w-3.5" /> Interromper fala
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={clearHistory} title="Limpar conversa">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "animate-lia-fade-up flex gap-3",
              m.role === "user" && "flex-row-reverse",
            )}
          >
            {m.role === "lia" && <LiaOrb state="idle" size={26} className="mt-1 shrink-0" />}
            <div
              className={cn(
                "max-w-[85%] text-sm leading-relaxed",
                m.role === "user"
                  ? "whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground"
                  : "text-foreground",
              )}
            >
              {m.role === "user" ? m.content : <Markdown content={m.content} />}
              {!!m.attachments?.length && (
                <div className="mt-2 flex flex-col gap-2">
                  {m.attachments.map((a, i) => (
                    <AttachmentCard key={`${m.id}-${i}`} a={a} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LiaOrb state="thinking" size={26} />
            <span className="animate-pulse">Lia está pensando…</span>
            <Button size="sm" variant="ghost" onClick={stop}>
              <Square className="mr-1.5 h-3 w-3" /> Interromper
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <footer className="sticky bottom-0 z-10 border-t border-border bg-background/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:p-3">
        {!!pending.length && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((a, i) => (
              <AttachmentPreview
                key={`${a.name}-${i}`}
                a={a}
                onRemove={() => setPending((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-xl border border-border bg-surface/70 p-2 sm:flex">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Fale com a Lia…"
            rows={1}
            className="col-span-2 max-h-40 min-h-10 resize-none border-0 bg-transparent focus-visible:ring-0 sm:col-span-1"
          />
          <div className="col-span-2 flex shrink-0 items-center justify-end gap-1 sm:col-span-1">
          <Button
            size="icon"
            variant={micOn ? "default" : "ghost"}
            onClick={onMic}
            title={
              micSupported
                ? micOn
                  ? "Escuta contínua ativa — clique para desligar"
                  : "Ativar escuta contínua"
                : "Microfone não suportado neste navegador"
            }
            className={cn(micOn && "glow", listening && "animate-lia-pulse")}
          >
            <Mic className="h-4 w-4" />
          </Button>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.json,image/*,application/pdf,text/plain,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void readFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            title="Anexar imagem ou arquivo"
          >
            {preparing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>

          <Button size="icon" variant="ghost" onClick={onTreat} title="Recompensar a Lia">
            <Cookie className="h-4 w-4" />
          </Button>

          <Button size="icon" variant="ghost" onClick={onCameraFocus} title="Sistema de visão">
            <Camera className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={submit} disabled={preparing || (!draft.trim() && !pending.length) || sending}>
            <Send className="h-4 w-4" />
          </Button>
          </div>
        </div>
      </footer>
    </section>
  );
}
