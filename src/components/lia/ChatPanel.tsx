import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Send, Square, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LiaOrb, stateLabel } from "./LiaOrb";
import { useLia } from "@/lib/lia/LiaProvider";
import { cn } from "@/lib/utils";

export function ChatPanel({
  listening,
  micOn,
  micState,
  speaking,
  onMic,
  onStopSpeech,
  micSupported,
  onCameraFocus,
}: {
  listening: boolean;
  micOn: boolean;
  micState: "off" | "sleeping" | "active" | "hearing" | "processing" | "speaking";
  speaking: boolean;
  onMic: () => void;
  onStopSpeech: () => void;
  micSupported: boolean;
  onCameraFocus: () => void;
}) {
  const { messages, send, sending, stop, state, profile, clearHistory } = useLia();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const submit = () => {
    const text = draft;
    setDraft("");
    void send(text);
  };

  return (
    <section className="panel flex min-h-0 flex-1 flex-col">
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
                "max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground"
                  : "text-foreground",
              )}
            >
              {m.content}
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

      <footer className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface/70 p-2">
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
            className="max-h-40 min-h-10 resize-none border-0 bg-transparent focus-visible:ring-0"
          />
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

          <Button size="icon" variant="ghost" onClick={onCameraFocus} title="Sistema de visão">
            <Camera className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={submit} disabled={!draft.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </section>
  );
}
