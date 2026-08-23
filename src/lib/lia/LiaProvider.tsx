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
import { describeVision, visionSource } from "./vision";
import * as memoryStore from "./memory-store";
import type {
  ChatMessage,
  LiaCardData,
  LiaModule,
  LiaState,
  MemoryItem,
  ModuleId,
  Personality,
  Profile,
  UserIdentity,
} from "./types";

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
  send: (text: string) => Promise<void>;
  stop: () => void;
  clearHistory: () => void;
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
}

const LiaContext = createContext<LiaContextValue | null>(null);

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
  }, []);

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
  };

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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      stop();

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
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
        servicos: connectedIds.map(connectorLabel),
      });
      void obs;
      const history = withUser.slice(-16).map((m) => ({
        role: m.role === "lia" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      try {
        const res = await liaRespond({
          data: { system, messages: history, ...(frame ? { frame } : {}) },
        });
        if (token.cancelled) return;
        const { clean, learned } = extractMemories(res.text);
        const liaMsg: ChatMessage = {
          id: uid(),
          role: "lia",
          content: clean || res.text,
          createdAt: Date.now(),
        };
        const finalMsgs = [...withUser, liaMsg];
        setSessionMessages(finalMsgs);

        if (data && cardConnected) {
          const memoryModuleOn = data.modules.find((m) => m.id === "memoria")?.ativo;
          const newMemories: MemoryItem[] =
            memoryModuleOn && res.ok
              ? learned.map((l) => ({ ...l, id: uid(), createdAt: Date.now(), source: "lia" }))
              : [];
          persist({
            ...data,
            history: finalMsgs.slice(-200),
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
      connectedIds,
    ],
  );

  const value: LiaContextValue = {
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
  };

  return <LiaContext.Provider value={value}>{children}</LiaContext.Provider>;
}

export function useLia() {
  const ctx = useContext(LiaContext);
  if (!ctx) throw new Error("useLia deve ser usado dentro de LiaProvider");
  return ctx;
}
