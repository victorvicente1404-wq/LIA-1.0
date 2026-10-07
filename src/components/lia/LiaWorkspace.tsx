import { useCallback, useEffect, useRef, useState } from "react";
import { BootSequence } from "./BootSequence";
import { ChatPanel } from "./ChatPanel";
import { PerceptionPanel } from "./PerceptionPanel";
import { SidePanel } from "./SidePanel";
import { LiaOrb } from "./LiaOrb";
import { DevPanel } from "./DevPanel";
import { ConversationsSidebar } from "./ConversationsSidebar";
import { useLia } from "@/lib/lia/LiaProvider";
import { useVoice } from "@/lib/lia/useVoice";
import { TreatDialog } from "./TreatDialog";
import { Button } from "@/components/ui/button";
import { Eye, Menu, Settings2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { applyTheme, readTheme } from "@/lib/lia/theme";
import { markProactive, proactiveEnabled, readTopics } from "@/lib/lia/proactive";
import { notify } from "@/lib/lia/notifications";
import { hasPushSubscription } from "@/lib/lia/push-client";
import { sendSelfPush } from "@/lib/lia/push.functions";
import { useWhatsAppWatcher } from "@/lib/lia/useWhatsAppWatcher";

export function LiaWorkspace() {
  const lia = useLia();
  const { messages, send, cardConnected, profile, modules, setState, sending } = lia;
  const perceptionRef = useRef<HTMLDivElement>(null);
  const [spokenId, setSpokenId] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [treatOpen, setTreatOpen] = useState(false);
  const [mobileVisionOpen, setMobileVisionOpen] = useState(false);
  const clicksRef = useRef<number[]>([]);
  const greetedRef = useRef(false);
  useWhatsAppWatcher();

  useEffect(() => applyTheme(readTheme()), []);

  // Cinco cliques rápidos no ícone da Lia abrem o painel interno.
  const onLogoClick = useCallback(() => {
    const now = Date.now();
    clicksRef.current = [...clicksRef.current, now].filter((t) => now - t < 2000);
    if (clicksRef.current.length >= 5) {
      clicksRef.current = [];
      setDevOpen(true);
    }
  }, []);

  const onTranscript = useCallback(
    (text: string) => {
      void send(text);
    },
    [send],
  );

  const voice = useVoice(onTranscript, {
    wakeWord: lia.settings.wakeWord ?? false,
    wakeWordName: lia.settings.wakeWordName ?? "lia",
    sensibilidade: lia.settings.sensibilidade ?? 60,
    silencioMs: lia.settings.silencioMs ?? 1200,
  });
  const voiceModuleOn =
    (modules.find((m) => m.id === "voz")?.ativo ?? false) && lia.settings.fala !== false;

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

  useEffect(() => {
    if (!cardConnected) {
      greetedRef.current = false;
      return;
    }
    if (!lia.booted || !proactiveEnabled() || greetedRef.current) return;
    greetedRef.current = true;
    const topics = readTopics().map((topic) => topic.assunto);
    lia.greetProactively(topics);
    markProactive();
  }, [lia.booted, cardConnected, lia]);

  useEffect(() => {
    if (!last || last.role !== "lia" || last.id === "greeting" || document.visibilityState === "visible") return;
    const body = last.content.replace(/[*_#`]/g, "").slice(0, 180);
    void (async () => {
      if (await hasPushSubscription()) {
        const r = await sendSelfPush({ data: { title: "Tarefa concluída", body, tag: "lia-chat" } }).catch(() => null);
        if (r?.sent) return;
      }
      notify("Lia", body);
    })();
  }, [last]);

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
    <div className="flex h-dvh flex-col gap-2 overflow-hidden p-2 md:gap-3 md:p-3">
      <header className="panel grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="icon" variant="ghost" className="shrink-0 lg:hidden" onClick={() => setMobileHistoryOpen(true)} title="Conversas">
            <Menu className="h-4 w-4" />
          </Button>
          <button type="button" onClick={onLogoClick} aria-label="Lia" className="rounded-full">
            <LiaOrb state={lia.state} size={34} />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold tracking-[0.2em] text-gradient-lia">
              LIA
            </h1>
            <p className="truncate text-[10px] uppercase text-muted-foreground">
              assistente pessoal · modular · privada
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px]">
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
            <span className="hidden sm:inline">{cardConnected ? "Lia Card conectado" : "Lia Card não conectado"}</span>
          </span>
          <Button size="icon" variant={mobileVisionOpen ? "secondary" : "ghost"} className="xl:hidden" onClick={() => setMobileVisionOpen((v) => !v)} title="Visão da Lia">
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMobileSettingsOpen(true)} title="Painel da Lia">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 auto-rows-min [&>*:last-child]:min-h-0 gap-3 overflow-hidden lg:grid-cols-[auto_minmax(0,1fr)_24rem] xl:grid-cols-[auto_18rem_minmax(26rem,1fr)_24rem]">
        <div className="hidden min-h-0 lg:flex">
          <ConversationsSidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
        </div>
        <div ref={perceptionRef} className="hidden min-h-0 xl:flex">
          <PerceptionPanel listening={voice.hearing} speaking={voice.speaking} audioLevel={voice.audioLevel} />
        </div>
        <div className={`min-h-0 xl:hidden ${mobileVisionOpen ? "" : "hidden"}`}>
          <PerceptionPanel compact listening={voice.hearing} speaking={voice.speaking} audioLevel={voice.audioLevel} />
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
            window.innerWidth < 1280 ? setMobileVisionOpen((v) => !v) : perceptionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          onTreat={() => setTreatOpen(true)}
        />
        <div className="hidden min-h-0 lg:flex"><SidePanel /></div>
      </main>

      <DevPanel open={devOpen} onOpenChange={setDevOpen} />
      <TreatDialog open={treatOpen} onOpenChange={setTreatOpen} />
      <Sheet open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
        <SheetContent side="left" className="w-[88vw] p-2 sm:max-w-sm">
          <SheetHeader className="sr-only"><SheetTitle>Conversas</SheetTitle><SheetDescription>Histórico de conversas da Lia</SheetDescription></SheetHeader>
          <ConversationsSidebar open onToggle={() => setMobileHistoryOpen(false)} />
        </SheetContent>
      </Sheet>
      <Sheet open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
        <SheetContent side="right" className="w-[94vw] overflow-y-auto p-2 sm:max-w-md">
          <SheetHeader className="sr-only"><SheetTitle>Painel da Lia</SheetTitle><SheetDescription>Percepção, configurações e Lia Card</SheetDescription></SheetHeader>
          <div className="space-y-3 pt-8 xl:hidden">
            <SidePanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
