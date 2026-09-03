import { useCallback, useEffect, useRef, useState } from "react";
import { BootSequence } from "./BootSequence";
import { ChatPanel } from "./ChatPanel";
import { PerceptionPanel } from "./PerceptionPanel";
import { SidePanel } from "./SidePanel";
import { LiaOrb } from "./LiaOrb";
import { useLia } from "@/lib/lia/LiaProvider";
import { useVoice } from "@/lib/lia/useVoice";

export function LiaWorkspace() {
  const lia = useLia();
  const { messages, send, cardConnected, profile, modules, setState, sending } = lia;
  const perceptionRef = useRef<HTMLDivElement>(null);
  const [spokenId, setSpokenId] = useState<string | null>(null);

  const onTranscript = useCallback(
    (text: string) => {
      void send(text);
    },
    [send],
  );

  const voice = useVoice(onTranscript, {
    wakeWord: lia.settings.wakeWord,
    wakeWordName: lia.settings.wakeWordName,
    sensibilidade: lia.settings.sensibilidade,
    silencioMs: lia.settings.silencioMs,
  });
  const voiceModuleOn = modules.find((m) => m.id === "voz")?.ativo ?? false;

  // A Lia fala a última mensagem quando o módulo de voz está ativo.
  const last = messages[messages.length - 1];
  useEffect(() => {
    if (!last || last.role !== "lia" || last.id === spokenId) return;
    setSpokenId(last.id);
    if (voiceModuleOn && last.id !== "greeting")
      voice.speak(last.content, { velocidade: profile.voz.velocidade, tom: profile.voz.tom });
  }, [last, spokenId, voiceModuleOn, voice, profile.voz]);

  // Terminou de processar: o microfone volta a escutar.
  useEffect(() => {
    if (!sending) voice.resumeAfterResponse();
  }, [sending, voice]);

  useEffect(() => {
    if (voice.hearing) setState("listening");
    else if (voice.speaking) setState("speaking");
    else if (sending) setState("thinking");
    else setState("idle");
  }, [voice.hearing, voice.speaking, sending, setState]);

  if (!lia.booted) {
    return (
      <BootSequence
        cardConnected={lia.cardConnected}
        cardPresent={lia.cardPresent}
        onDone={lia.finishBoot}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <header className="panel flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <LiaOrb state={lia.state} size={34} />
          <div>
            <h1 className="font-display text-lg font-semibold tracking-[0.2em] text-gradient-lia">
              LIA
            </h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              assistente pessoal · modular · privada
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="hidden text-muted-foreground sm:inline">perfil {profile.nome}</span>
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              cardConnected
                ? "border-primary/50 bg-primary/10 text-glow"
                : "border-border text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${cardConnected ? "bg-glow" : "bg-muted-foreground"}`}
            />
            {cardConnected ? "Lia Card conectado" : "Lia Card não conectado"}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div ref={perceptionRef} className="lg:contents">
          <PerceptionPanel listening={voice.hearing} speaking={voice.speaking} />
        </div>
        <ChatPanel
          listening={voice.hearing}
          micOn={voice.micOn}
          micState={voice.micState}
          speaking={voice.speaking}
          micSupported={voice.supported.mic}
          onMic={() => (voice.micOn ? voice.stopListening() : voice.startListening())}
          onStopSpeech={voice.shutUp}
          onCameraFocus={() =>
            perceptionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
        <SidePanel />
      </main>
    </div>
  );
}
