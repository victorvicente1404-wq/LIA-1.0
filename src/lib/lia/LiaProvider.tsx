/**
 * Núcleo da Lia no cliente: estado, memória, perfis, personalidade,
 * módulos e ciclo de vida do Lia Card.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as card from "./card-storage";
import { defaultModules, defaultProfiles, uid } from "./defaults";
import { buildSystemPrompt, extractMemories } from "./prompt";
import { useConnections } from "./useConnections";
import { connectorLabel } from "./connectors";
import { liaRespond } from "./chat.functions";
import { whatsappCredsForChat } from "./whatsappService";
import { readIot, writeIot } from "./iot";
import { sendSerial, serialConnected } from "./webserial";
import type { IotConfig } from "./types";
import { describeVision, visionSource } from "./vision";
import { readDevSettings } from "./dev-settings";
import * as convo from "./conversations";
import type { Conversation } from "./conversations";
import * as memoryStore from "./memory-store";
import type {
  Attachment,
  ChatMessage,
  LiaCardData,
  LiaModule,
  LiaBond,
  LiaState,
  MemoryItem,
  ModuleId,
  Personality,
  Profile,
  UserIdentity,
  TreatId,
  CustomApi,
} from "./types";
import { syncCustomApisToAccount } from "./custom-apis";
import { DEFAULT_BOND, rewardBond, TREATS } from "./rewards";
import * as link from "./sync/link";
import { notify } from "./notifications";
import { applyTheme, readTheme } from "./theme";
import { toast } from "sonner";

const GREETING = "Olá! Eu sou a Lia. Como posso ajudar?";

interface LiaContextValue {
  booted: boolean;
  finishBoot: () => void;
  cardConnected: boolean;
  cardPresent: boolean;
  data: LiaCardData | null;
  profiles: Profile[];
  profile: Profile;
  personality: Personality;
  modules: LiaModule[];
  memory: MemoryItem[];
  user: UserIdentity;
  messages: ChatMessage[];
  state: LiaState;
  setState: (s: LiaState) => void;
  sending: boolean;
  send: (text: string, attachments?: Attachment[]) => Promise<void>;
  stop: () => void;
  clearHistory: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  // gestão
  connectCard: () => void;
  ejectCard: () => void;
  createCard: (name?: string) => void;
  wipeCard: () => void;
  setActiveProfile: (id: string) => void;
  addProfile: (nome: string, descricao: string) => void;
  updatePersonality: (patch: Partial<Personality>) => void;
  updateUser: (patch: Partial<UserIdentity>) => void;
  toggleModule: (id: ModuleId) => void;
  addMemory: (item: Omit<MemoryItem, "id" | "createdAt">) => void;
  removeMemory: (id: string) => void;
  settings: LiaCardData["settings"];
  updateSettings: (patch: Partial<LiaCardData["settings"]>) => void;
  bond: LiaBond;
  giveTreat: (id: TreatId) => void;
  greetProactively: (topics: string[]) => void;
  customApis: CustomApi[];
  saveCustomApis: (list: CustomApi[]) => void;
  iot: IotConfig;
  saveIot: (cfg: IotConfig) => void;
  faces: { nome: string; descriptor: number[] }[];
  saveFaces: (list: { nome: string; descriptor: number[] }[]) => void;
}

// Mantém o mesmo contexto entre recarregamentos ao vivo (evita "fora do LiaProvider").
const g = globalThis as { __liaContext?: React.Context<LiaContextValue | null> };
const LiaContext = (g.__liaContext ??= createContext<LiaContextValue | null>(null));

const fallbackProfile = defaultProfiles[0] as Profile;

export function LiaProvider({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [data, setData] = useState<LiaCardData | null>(null);
  const [cardConnected, setCardConnected] = useState(false);
  const [cardPresent, setCardPresent] = useState(false);
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<LiaState>("idle");
  const [sending, setSending] = useState(false);
  const { connectedIds } = useConnections();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const abortRef = useRef<{ cancelled: boolean } | null>(null);

  // Detecta o Lia Card na inicialização
  useEffect(() => {
    const present = card.cardExists();
    const mounted = present && card.isMounted();
    setCardPresent(present);
    setCardConnected(mounted);
    if (mounted) {
      const loaded = card.readCard();
      setData(loaded);
      setSessionMessages(loaded?.history ?? []);
    }

    // Histórico de conversas do navegador
    const list = convo.readConversations();
    const activeId = convo.readActiveId();
    const active = list.find((c) => c.id === activeId) ?? list[0];
    if (active) {
      setConversations(list);
      setActiveConversationId(active.id);
      if (active.messages.length) setSessionMessages(active.messages);
    } else {
      const created = convo.newConversation();
      setConversations([created]);
      setActiveConversationId(created.id);
      convo.writeConversations([created]);
      convo.writeActiveId(created.id);
    }
  }, []);

  // Lia Link: aplica mudanças vindas de outros aparelhos e executa comandos remotos.
  useEffect(() => {
    const reload = () => {
      if (card.isMounted()) {
        setCardPresent(true);
        setCardConnected(true);
        setData(card.readCard());
      }
      const list = convo.readConversations();
      setConversations(list);
      const active = list.find((c) => c.id === convo.readActiveId());
      if (active) setSessionMessages(active.messages);
      applyTheme(readTheme());
    };
    window.addEventListener(link.APPLIED_EVENT, reload);
    link.onRemoteCommand(async (cmd) => {
      let note = "";
      if (cmd.acao === "notificar") {
        await notify("Lia", cmd.texto ?? "Aviso da Lia");
        note = `aviso mostrado: "${cmd.texto ?? ""}"`;
      } else if (cmd.acao === "abrir_link" && cmd.url) {
        toast("Lia pediu para abrir um link", { action: { label: "Abrir", onClick: () => window.open(cmd.url, "_blank", "noopener") } });
        note = `link enviado: ${cmd.url}`;
      } else if (cmd.acao === "usb" && cmd.usb) {
        const out = await sendSerial(cmd.usb);
        note = cmd.usb.action.endsWith("read") ? `pino ${cmd.usb.pin}: **${out}**` : `pino ${cmd.usb.pin} acionado`;
      }
      link.appendLiaMessage(cmd.conversationId, `📲 Feito em ${link.deviceName()}: ${note}`);
    });
    void link.initLink();
    return () => window.removeEventListener(link.APPLIED_EVENT, reload);
  }, []);

  // Salva a conversa ativa a cada mudança de mensagens
  useEffect(() => {
    if (!activeConversationId) return;
    setConversations((prev) => {
      const cur = prev.find((c) => c.id === activeConversationId);
      const sliced = sessionMessages.slice(-200);
      if (cur && cur.messages.length === sliced.length && cur.messages.at(-1)?.id === sliced.at(-1)?.id) return prev;
      const next = prev.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              messages: sessionMessages.slice(-200),
              title: convo.titleFor(sessionMessages),
              updatedAt: Date.now(),
            }
          : c,
      );
      convo.writeConversations(next);
      return next;
    });
  }, [sessionMessages, activeConversationId]);

  const persist = useCallback(
    (next: LiaCardData) => {
      setData(next);
      if (cardConnected) card.writeCard(next);
      if (next.settings.memoriaLocal) {
        void memoryStore.writeMemories(next).catch(() => {
          /* local indisponível — a UI de Configurações informa o usuário */
        });
      }
    },
    [cardConnected],
  );

  const profiles = data?.profiles ?? defaultProfiles;
  const profile = profiles.find((p) => p.id === data?.activeProfileId) ?? fallbackProfile;
  const personality = profile.personality;
  const modules = data?.modules ?? defaultModules;
  const memory = profile.memory ?? [];
  const user = data?.user ?? { nome: "", pronome: "", notas: "" };
  const settings = data?.settings ?? {
    aiExterna: true,
    camera: false,
    microfone: false,
    animacoes: true,
    memoriaLocal: null,
    fala: true,
    wakeWord: false,
    wakeWordName: "lia",
    sensibilidade: 60,
    silencioMs: 1200,
  };
  const bond = data?.bond ?? DEFAULT_BOND;

  const messages = useMemo(
    () =>
      sessionMessages.length
        ? sessionMessages
        : [{ id: "greeting", role: "lia" as const, content: GREETING, createdAt: Date.now() }],
    [sessionMessages],
  );

  const updateProfile = useCallback(
    (patch: (p: Profile) => Profile) => {
      if (!data) return;
      persist({
        ...data,
        profiles: data.profiles.map((p) => (p.id === data.activeProfileId ? patch(p) : p)),
      });
    },
    [data, persist],
  );

  const addMemory = useCallback(
    (item: Omit<MemoryItem, "id" | "createdAt">) =>
      updateProfile((p) => ({
        ...p,
        memory: [{ ...item, id: uid(), createdAt: Date.now() }, ...p.memory].slice(0, 200),
      })),
    [updateProfile],
  );

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.cancelled = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSending(false);
    setState("idle");
  }, []);

  const send = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      const trimmed = text.trim();
      if ((!trimmed && !attachments?.length) || sending) return;
      stop();

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        ...(attachments?.length ? { attachments } : {}),
      };
      const base = sessionMessages.length
        ? sessionMessages
        : [
            {
              id: "greeting",
              role: "lia" as const,
              content: GREETING,
              createdAt: Date.now(),
            },
          ];
      const withUser = [...base, userMsg];
      setSessionMessages(withUser);
      setSending(true);
      setState("thinking");

      const token = { cancelled: false };
      abortRef.current = token;

      const visionModuleOn = modules.find((m) => m.id === "visao")?.ativo ?? false;
      const obs = visionSource.get();
      const frame = visionModuleOn ? (visionSource.captureNow()?.dataUrl ?? null) : null;
      const system = buildSystemPrompt({
        user,
        profile,
        personality,
        memory,
        cardConnected,
        vision: describeVision(visionSource.get(), visionModuleOn),
        memoriaLocal: data?.settings.memoriaLocal ?? null,
        servicos: [
          ...connectedIds.map(connectorLabel),
          ...(whatsappCredsForChat() ? ["WhatsApp"] : []),
          ...((data?.iot?.url || readIot().url) && modules.find((m) => m.id === "automacao")?.ativo ? ["Arduino/ESP32 (ferramenta iot_comando)"] : []),
          ...(serialConnected() && modules.find((m) => m.id === "automacao")?.ativo ? ["Arduino Uno via USB (ferramenta usb_comando)"] : []),
        ],
      });
      const whatsapp = whatsappCredsForChat();
      const iotCfg = data?.iot?.url ? data.iot : readIot();
      const iotAtivo = !!iotCfg.url && !!modules.find((m) => m.id === "automacao")?.ativo;
      void obs;
      const extra = readDevSettings().systemPromptExtra.trim();
      const systemFinal = extra ? `${system}\n\nINSTRUÇÕES EXTRAS DO PAINEL INTERNO\n${extra}` : system;
      const history = withUser.slice(-16).map((m) => ({
        role: m.role === "lia" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      try {
        const res = await liaRespond({
          data: {
            system: systemFinal,
            messages: history,
            ...(frame ? { frame } : {}),
            ...(whatsapp ? { whatsapp } : {}),
            ...(iotAtivo ? { iot: iotCfg } : {}),
            ...(serialConnected() && modules.find((m) => m.id === "automacao")?.ativo ? { usb: true } : {}),
            ...(link.remoteKinds().length ? { remoteDevices: link.remoteKinds() } : {}),
            ...(data?.customApis?.length ? { customApis: data.customApis } : {}),
            ...(attachments?.length
              ? {
                  attachments: attachments.map((a) => ({
                    name: a.name,
                    mime: a.mime,
                    ...(a.dataUrl ? { dataUrl: a.dataUrl } : {}),
                    ...(a.text ? { text: a.text } : {}),
                  })),
                }
              : {}),
          },
        });
        if (token.cancelled) return;
        const usbJson = "usbJson" in res ? res.usbJson : undefined;
        let usbNote = "";
        if (usbJson) {
          for (const c of JSON.parse(usbJson) as Parameters<typeof sendSerial>[0][]) {
            try {
              const out = await sendSerial(c);
              if (c.action.endsWith("read")) usbNote += `\n\n🔌 Pino ${c.pin}: **${out}**`;
            } catch (e) {
              usbNote += `\n\n⚠️ USB: ${(e as Error).message}`;
            }
          }
        }
        const remoteJson = "remoteJson" in res ? res.remoteJson : undefined;
        if (remoteJson) {
          for (const c of JSON.parse(remoteJson) as (link.RemoteCommand & { alvo: "mobile" | "desktop" })[]) {
            const { alvo, ...cmd } = c;
            void link.dispatchRemote(alvo, { ...cmd, ...(activeConversationId ? { conversationId: activeConversationId } : {}) }).catch(() => undefined);
          }
        }
        const { clean, learned } = extractMemories(res.text + usbNote);
        const liaMsg: ChatMessage = {
          id: uid(),
          role: "lia",
          content: clean || res.text,
          createdAt: Date.now(),
        };
        const finalMsgs = [...withUser, liaMsg];
        setSessionMessages(finalMsgs);

        const regJson = "registeredJson" in res ? res.registeredJson : undefined;
        const registered = regJson ? (JSON.parse(regJson) as CustomApi[]) : undefined;
        const apisNext = registered?.length
          ? [...(data?.customApis ?? []).filter((a) => !registered.some((r) => r.name === a.name)), ...registered]
          : data?.customApis;
        if (registered?.length) void syncCustomApisToAccount(apisNext ?? []);
        if (data && cardConnected) {
          const memoryModuleOn = data.modules.find((m) => m.id === "memoria")?.ativo;
          const newMemories: MemoryItem[] =
            memoryModuleOn && res.ok
              ? learned.map((l) => ({ ...l, id: uid(), createdAt: Date.now(), source: "lia" }))
              : [];
          persist({
            ...data,
            history: finalMsgs.slice(-200),
            ...(apisNext ? { customApis: apisNext } : {}),
            profiles: data.profiles.map((p) =>
              p.id === data.activeProfileId
                ? { ...p, memory: [...newMemories, ...p.memory].slice(0, 200) }
                : p,
            ),
          });
        }
        setState(res.ok ? "speaking" : "idle");
      } catch (error) {
        if (token.cancelled) return;
        setSessionMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "lia",
            content: `Tive um problema de conexão com meu núcleo de linguagem: ${(error as Error).message}`,
            createdAt: Date.now(),
          },
        ]);
        setState("idle");
      } finally {
        if (!token.cancelled) setSending(false);
      }
    },
    [
      sending,
      sessionMessages,
      stop,
      user,
      profile,
      personality,
      memory,
      cardConnected,
      data,
      persist,
      modules,
      connectedIds.join(","),
      activeConversationId,
    ],
  );

  const value: LiaContextValue = {
    faces: data?.faces ?? [],
    saveFaces: (list) => {
      if (data) persist({ ...data, faces: list });
    },
    iot: data?.iot ?? readIot(),
    saveIot: (cfg) => {
      writeIot(cfg);
      if (data) persist({ ...data, iot: cfg });
    },
    customApis: data?.customApis ?? [],
    saveCustomApis: (list) => {
      if (!data) return;
      persist({ ...data, customApis: list });
      void syncCustomApisToAccount(list);
    },
    booted,
    finishBoot: () => setBooted(true),
    cardConnected,
    cardPresent,
    data,
    profiles,
    profile,
    personality,
    modules,
    memory,
    user,
    messages,
    state,
    setState,
    sending,
    send,
    stop,
    clearHistory: () => {
      setSessionMessages([]);
      if (data) persist({ ...data, history: [] });
    },
    conversations,
    activeConversationId,
    newConversation: () => {
      const created = convo.newConversation();
      setConversations((prev) => {
        const next = [created, ...prev];
        convo.writeConversations(next);
        return next;
      });
      setActiveConversationId(created.id);
      convo.writeActiveId(created.id);
      setSessionMessages([]);
    },
    selectConversation: (id) => {
      const found = conversations.find((c) => c.id === id);
      if (!found) return;
      setActiveConversationId(id);
      convo.writeActiveId(id);
      setSessionMessages(found.messages);
    },
    deleteConversation: (id) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        const list = next.length ? next : [convo.newConversation()];
        convo.writeConversations(list);
        if (id === activeConversationId) {
          const first = list[0];
          if (!first) return list;
          setActiveConversationId(first.id);
          convo.writeActiveId(first.id);
          setSessionMessages(first.messages);
        }
        return list;
      });
    },
    connectCard: () => {
      const present = card.cardExists();
      if (!present) return;
      card.mount();
      const loaded = card.readCard();
      setCardPresent(true);
      setCardConnected(true);
      setData(loaded);
      setSessionMessages(loaded?.history ?? []);
    },
    ejectCard: () => {
      card.eject();
      setCardConnected(false);
      setData(null);
      setSessionMessages([]);
    },
    createCard: (name?: string) => {
      const created = card.formatCard(name);
      setCardPresent(true);
      setCardConnected(true);
      setData(created);
      setSessionMessages([]);
    },
    wipeCard: () => {
      card.destroyCard();
      setCardPresent(false);
      setCardConnected(false);
      setData(null);
      setSessionMessages([]);
    },
    setActiveProfile: (id) => {
      if (!data) return;
      persist({ ...data, activeProfileId: id });
    },
    addProfile: (nome, descricao) => {
      if (!data) return;
      const novo: Profile = {
        ...fallbackProfile,
        id: uid(),
        nome,
        descricao,
        memory: [],
      };
      persist({ ...data, profiles: [...data.profiles, novo], activeProfileId: novo.id });
    },
    updatePersonality: (patch) =>
      updateProfile((p) => ({ ...p, personality: { ...p.personality, ...patch } })),
    updateUser: (patch) => {
      if (!data) return;
      persist({ ...data, user: { ...data.user, ...patch } });
    },
    toggleModule: (id) => {
      if (!data) return;
      persist({
        ...data,
        modules: data.modules.map((m) => (m.id === id ? { ...m, ativo: !m.ativo } : m)),
      });
    },
    addMemory,
    removeMemory: (id) => updateProfile((p) => ({ ...p, memory: p.memory.filter((m) => m.id !== id) })),
    settings,
    updateSettings: (patch) => {
      if (!data) return;
      persist({ ...data, settings: { ...data.settings, ...patch } });
    },
    bond,
    giveTreat: (id) => {
      const treat = TREATS.find((item) => item.id === id);
      if (!treat) return;
      const nextBond = rewardBond(data?.bond, id);
      if (data) persist({ ...data, bond: nextBond });
      setSessionMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "lia",
          content: `${treat.emoji} ${treat.reaction}`,
          createdAt: Date.now(),
        },
      ]);
      setState("speaking");
    },
    greetProactively: (topics) => {
      const hour = new Date().getHours();
      const period = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
      const name = user.nome.trim() ? `, ${user.nome.trim()}` : "";
      const pending = topics.length
        ? ` Estou acompanhando ${topics.slice(0, 2).join(" e ")}. Quer que eu confira as novidades?`
        : " Estou pronta para organizar seu dia ou acompanhar algo importante.";
      setSessionMessages((prev) => [
        ...prev,
        { id: uid(), role: "lia", content: `${period}${name}.${pending}`, createdAt: Date.now() },
      ]);
    },
  };

  return <LiaContext.Provider value={value}>{children}</LiaContext.Provider>;
}

export function useLia() {
  const ctx = useContext(LiaContext);
  if (!ctx) throw new Error("useLia deve ser usado dentro de LiaProvider");
  return ctx;
}
