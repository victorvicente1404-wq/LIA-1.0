/**
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
import { localLlmReply, localLlmPlanAccessibility } from "./termux-llm";
import { runAccessibilityPlan } from "./accessibility-actions";
import { whatsappCredsForChat } from "./whatsappService";
import { readIot, writeIot } from "./iot";
import { sendSerial, serialConnected } from "./webserial";
import { parseArduinoChat } from "./arduino-chat";
import { ROOMS, contextSnapshot, setTorch, vibrate } from "./device";
import type { IotConfig } from "./types";
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
import { DEFAULT_BOND, driftBond, evolveBond, rewardBond, TREATS } from "./rewards";
import { applyFaceTags } from "./face-engine";
import { nativeBatteryStatus, nativeScreenSummary } from "./native-device";
import { retrieveRelevantMemories } from "./memory-retrieval";
import { findExactMemoryQuery, findMemoryByExactKey, parseMemoryWriteCommand, upsertMemory } from "./memory-commands";
import * as link from "./sync/link";
import { notify } from "./notifications";
import { applyTheme, readTheme } from "./theme";
import { toast } from "sonner";

const GREETING = "Olá! Eu sou a Lia. Como posso ajudar?";
/** Prazo máximo de uma resposta antes de liberar o chat com um aviso. */
const CHAT_TIMEOUT_MS = 120_000;

/** Oculta tags internas de memória e expressão enquanto a resposta chega em streaming. */
function stripInternalTags(text: string): string {
  return text
    .replace(/\[\[(?:LEMBRAR|rosto):[\s\S]*?(?:\]\]|$)/gi, "")
    .replace(/^\s*-\s*\[(?:perfil|preferencia|conhecimento|rotina|relacionamento|importante)\]\s*[^:\n]+:\s*.*$/gim, "")
    .replace(/\[(?:perfil|preferencia|conhecimento|rotina|relacionamento|importante)\]\s*[^:\n]+:\s*[^\n]*?\s*\[(?:perfil|preferencia|conhecimento|rotina|relacionamento|importante)\]/gi, "")
    .trimEnd();
}

/** Reconhece consultas de bateria que devem ser executadas no Android, não respondidas pelo modelo. */
function isBatteryQuery(question: string): boolean {
  const normalized = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  return /\b(?:bateria|carga)\b/.test(normalized) &&
    /\b(?:consulte|consultar|qual|quanto|nivel|porcentagem|estado|status|ver|mostre|confira|cheque)\b/.test(normalized);
}


/** Detecta pedidos diretos de controle do aparelho; perguntas explicativas seguem para o chat normal. */
function looksLikeAccessibilityCommand(question: string): boolean {
  const normalized = question.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  if (/^(como|por que|porque|o que|qual|quais|quando|onde|sera que|da para|tem como)\\b/.test(normalized)) return false;
  return /\\b(?:abra|abre|abrir|acessa|acesse|entre|entra|va para|vai para|volte|volta|clique|clica|toque|toca|digite|digita|escreva|escreve|procure|procura|pesquise|pesquisa|role|rola|deslize|desliza|mande|manda|envie|envia|enviar)\\b/.test(normalized);
}

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

/** Mescla o backup externo sem apagar memórias que já existem no Lia Card. */
function mergeMemoryBackup(current: LiaCardData, backup: LiaCardData): LiaCardData {
  const safeCurrent = card.normalizeCardData(current);
  const safeBackup = card.normalizeCardData(backup);
  const profiles = safeCurrent.profiles.map((profile) => {
    const saved = safeBackup.profiles.find((candidate) => candidate.id === profile.id || candidate.nome === profile.nome);
    if (!saved) return profile;
    const seen = new Set(profile.memory.map((item) =>
      `${item.kind}|${item.key.trim().toLocaleLowerCase("pt-BR")}|${item.value.trim().toLocaleLowerCase("pt-BR")}`,
    ));
    const extras = (Array.isArray(saved.memory) ? saved.memory : []).filter((item) => {
      if (!item || typeof item.key !== "string" || typeof item.value !== "string") return false;
      const key = `${item.kind}|${item.key.trim().toLocaleLowerCase("pt-BR")}|${item.value.trim().toLocaleLowerCase("pt-BR")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...profile, memory: [...extras, ...profile.memory].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200) };
  });
  return { ...safeCurrent, profiles };
}

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
  const abortRef = useRef<{ cancelled: boolean; abort?: () => void } | null>(null);

  // Hub de telemetria (bateria, rede, local, notificações)

  // Detecta o Lia Card e recupera, quando autorizado, o backup externo de memórias.
  useEffect(() => {
    let active = true;
    const present = card.cardExists();
    const mounted = present && card.isMounted();
    setCardPresent(present);
    setCardConnected(mounted);
    if (mounted) {
      const loaded = card.readCard();
      setData(loaded);
      setSessionMessages(loaded?.history ?? []);
      if (loaded?.settings.memoriaLocal) {
        void memoryStore.readMemories().then((backup) => {
          if (!active || !backup) return;
          if (backup.cardId && loaded?.cardId && backup.cardId !== loaded.cardId) return;
          // Lê novamente o cartão para não sobrescrever alterações feitas enquanto o arquivo era lido.
          const latest = card.readCard();
          if (!latest || !card.isMounted()) return;
          const merged = mergeMemoryBackup(latest, backup);
          card.writeCard(merged);
          setData(merged);
        }).catch(() => {
          // Arquivo ausente, permissão revogada ou armazenamento indisponível:
          // o Lia Card principal continua funcionando normalmente.
        });
      }
    }

    // Histórico de conversas do navegador
    const list = convo.readConversations();
    const activeId = convo.readActiveId();
    const activeConversation = list.find((c) => c.id === activeId) ?? list[0];
    if (activeConversation) {
      setConversations(list);
      setActiveConversationId(activeConversation.id);
      if (activeConversation.messages.length) setSessionMessages(activeConversation.messages);
    } else {
      const created = convo.newConversation();
      setConversations([created]);
      setActiveConversationId(created.id);
      convo.writeConversations([created]);
      convo.writeActiveId(created.id);
    }
    return () => { active = false; };
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
      } else if (cmd.acao === "vibrar") {
        note = vibrate() ? "vibrei" : "este aparelho não vibra";
      } else if (cmd.acao === "lanterna") {
        await setTorch(cmd.ligar !== false);
        note = cmd.ligar === false ? "lanterna apagada" : "lanterna acesa";
      } else if (cmd.acao === "usb" && cmd.usb) {
        const out = await sendSerial({ ...cmd.usb, value: cmd.usb.value ?? 0 });
        note = cmd.usb.action.endsWith("read") ? `\n\n🔌 Pino ${cmd.usb.pin}: **${out}**` : `pino ${cmd.usb.pin} acionado`;
      }
      link.appendLiaMessage(cmd.conversationId, `📲 Feito em ${link.deviceName()}: ${note}`);
    });
    void link.initLink();
    return () => window.removeEventListener(link.APPLIED_EVENT, reload);
  }, []);

  // Salva a conversa ativa a cada mudança de mensagens
  useEffect(() => {
    if (!activeConversationId) return;
    // Durante o streaming, cada chunk altera a mensagem. Não serializar e gravar
    // todo o histórico em cada atualização; a resposta final será persistida
    // quando streaming=false.
    if (sessionMessages.some((message) => message.streaming)) return;
    setConversations((prev) => {
      const cur = prev.find((c) => c.id === activeConversationId);
      const sliced = sessionMessages.slice(-200);
      if (cur && cur.messages.length === sliced.length && cur.messages.at(-1)?.id === sliced.at(-1)?.id) return prev;
      const next = prev.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              messages: sliced,
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
  const bond = useMemo(() => driftBond(data?.bond ?? DEFAULT_BOND), [data?.bond]);

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
    if (abortRef.current) { abortRef.current.cancelled = true; abortRef.current.abort?.(); }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSessionMessages((prev) =>
      prev.some((message) => message.streaming)
        ? prev.filter((message) => !message.streaming)
        : prev,
    );
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

      const token: { cancelled: boolean; abort?: () => void } = { cancelled: false };
      abortRef.current = token;

      // Local USB commands bypass all vision, context collection and AI providers.
      let local: ReturnType<typeof parseArduinoChat> = null;
      try {
        local = attachments?.length ? null : parseArduinoChat(trimmed);
      } catch (error) {
        const content = `Não consegui interpretar esse comando local: ${error instanceof Error ? error.message : "erro inesperado"}.`;
        setSessionMessages([...withUser, { id: uid(), role: "lia", content, createdAt: Date.now() }]);
        if (abortRef.current === token) { setSending(false); setState("idle"); }
        return;
      }
      if (local) {
        setState("idle");
        let content = "";
        try {
          if ("error" in local) content = local.error;
          else if (!serialConnected()) content = "Conecte o Arduino via USB em Módulos → Automação Arduino para eu enviar esse comando direto, sem IA.";
          else {
            const { pin, value, name } = local.command;
            const reply = await sendSerial({ action: "digital_write", pin, value });
            content = reply === String(value)
              ? `${name}, pino ${pin}: Arduino confirmou ${value ? "ligar (HIGH)" : "desligar (LOW)"}.`
              : "O Arduino não confirmou o comando. Confira o cabo USB e o sketch; não usei nenhuma API.";
          }
        } catch (error) {
          content = `Não consegui enviar pelo USB: ${error instanceof Error ? error.message : "conexão indisponível"}.`;
        } finally {
          if (!token.cancelled) {
            const finalMsgs: ChatMessage[] = [...withUser, { id: uid(), role: "lia", content, createdAt: Date.now(), localOnly: true }];
            setSessionMessages(finalMsgs);
            if (data && cardConnected) persist({ ...data, history: finalMsgs.slice(-200) });
          }
          if (abortRef.current === token) { setSending(false); setState("idle"); }
        }
        return;
      }
      // Operações explícitas de memória são determinísticas e não dependem do Qwen.
      if (!attachments?.length) {
        const writeCommand = parseMemoryWriteCommand(trimmed);
        const exactQuery = findExactMemoryQuery(trimmed);
        if (writeCommand || exactQuery) {
          let content = "";
          let savedData: LiaCardData | null = null;
          try {
            const memoryModuleOn = data?.modules.find((m) => m.id === "memoria")?.ativo === true;
            if (!data || !cardConnected || !card.isMounted()) {
              content = writeCommand
                ? "Não consegui salvar: conecte o Lia Card primeiro."
                : "Não consigo consultar as lembranças porque o Lia Card não está conectado.";
            } else if (!memoryModuleOn) {
              content = "O módulo Memória está desligado. Ative-o para guardar e consultar lembranças.";
            } else if (writeCommand) {
              const updatedProfiles = data.profiles.map((p) =>
                p.id === data.activeProfileId
                  ? { ...p, memory: upsertMemory(p.memory ?? [], writeCommand, uid) }
                  : p,
              );
              const candidate: LiaCardData = { ...data, profiles: updatedProfiles };
              card.writeCard(candidate);
              const verified = card.readCard();
              const verifiedProfile = verified?.profiles.find((p) => p.id === verified.activeProfileId);
              const verifiedEntry = verifiedProfile
                ? findMemoryByExactKey(writeCommand.key, verifiedProfile.memory)
                : null;
              if (!verified || !verifiedEntry || verifiedEntry.value !== writeCommand.value) {
                throw new Error("A leitura de confirmação não encontrou o valor gravado.");
              }
              savedData = verified;
              content = `Guardei na memória: ${verifiedEntry.key} = ${verifiedEntry.value}.`;
            } else {
              const found = findMemoryByExactKey(exactQuery!, profile.memory ?? []);
              content = found
                ? `O valor registrado em ${found.key} é: ${found.value}.`
                : `Não encontrei uma lembrança com a chave "${exactQuery}" no perfil ${profile.nome}.`;
            }
          } catch (error) {
            content = `Não consegui confirmar a operação de memória: ${error instanceof Error ? error.message : "erro de armazenamento"}.`;
            savedData = null;
          }
          const finalMsgs: ChatMessage[] = [...withUser, { id: uid(), role: "lia", content, createdAt: Date.now(), localOnly: true }];
          setSessionMessages(finalMsgs);
          if (savedData) {
            const withHistory = { ...savedData, history: finalMsgs.slice(-200) };
            try {
              card.writeCard(withHistory);
              setData(card.readCard() ?? withHistory);
              if (withHistory.settings.memoriaLocal) {
                void memoryStore.writeMemories(withHistory).catch(() => {
                  toast.error("A memória foi salva no Lia Card, mas não foi possível atualizar o backup externo.");
                });
              }
            } catch {
              setData(savedData);
              toast.error("A memória foi salva, mas não consegui atualizar o histórico do cartão.");
            }
          } else if (data && cardConnected) {
            try {
              const historyOnly = { ...data, history: finalMsgs.slice(-200) };
              card.writeCard(historyOnly);
              setData(card.readCard() ?? historyOnly);
            } catch {
              // A resposta continua visível mesmo se a gravação do histórico falhar.
            }
          }
          if (abortRef.current === token) { setSending(false); setState("idle"); }
          return;
        }
      }

      // Consultas de hardware são executadas por ferramenta nativa; o modelo nunca inventa telemetria.
      if (!attachments?.length && isBatteryQuery(trimmed)) {
        let content = "";
        try {
          const battery = await nativeBatteryStatus();
          content = battery
            ? `A bateria está em ${battery.level}%. Estado: ${battery.status}.${battery.plugged ? " O aparelho está conectado à energia." : ""}`
            : "Não consegui acessar a bateria nativa do Android. Confirme que está usando o APK atualizado da Lia.";
        } catch (error) {
          content = `Não consegui consultar a bateria do Android: ${error instanceof Error ? error.message : "falha na ferramenta nativa"}.`;
        }
        if (!token.cancelled) {
          const finalMsgs: ChatMessage[] = [...withUser, { id: uid(), role: "lia", content, createdAt: Date.now(), localOnly: true }];
          setSessionMessages(finalMsgs);
          if (data && cardConnected) persist({ ...data, history: finalMsgs.slice(-200) });
        }
        if (abortRef.current === token) { setSending(false); setState("idle"); }
        return;
      }

      // Controle offline do Android: um único executor mantém o controle enquanto replaneja após cada tela.
      if (!attachments?.length && looksLikeAccessibilityCommand(trimmed)) {
        const actionController = new AbortController();
        token.abort = () => actionController.abort();
        let content = "";
        try {
          const initialScreen = await nativeScreenSummary(3500);
          const firstPlan = await localLlmPlanAccessibility(trimmed, initialScreen, actionController.signal);
          if (token.cancelled || actionController.signal.aborted) return;
          if (firstPlan.needsAction && !firstPlan.steps.length) {
            content = firstPlan.stopReason || "Preciso de mais informações para continuar com segurança.";
          } else if (firstPlan.needsAction && firstPlan.steps.length) {
            const completedGoals: string[] = [];
            let currentGoal = firstPlan.goal;
            let typedMessage = false;
            let awaitingConfirmation = false;
            let planningStopReason = "";
            const result = await runAccessibilityPlan(
              { goal: firstPlan.goal, steps: firstPlan.steps },
              {
                signal: actionController.signal,
                onStep: (_index, step) => {
                  if (step.action === "type_text") typedMessage = true;
                  if (step.action !== "read_screen") completedGoals.push(currentGoal || step.action);
                },
                nextPlan: async (screen) => {
                  const screenText = screen.tree
                    .map((node) => node.text || node.description || "")
                    .filter(Boolean)
                    .join(" | ")
                    .slice(0, 3500);
                  if (typedMessage &&
                      /\\b(?:enviar|send)\\b/i.test(screenText) &&
                      /\\b(?:mensagem|mensagens|mandar|enviar|envie|manda)\\b/i.test(trimmed)) {
                    awaitingConfirmation = true;
                    return null;
                  }
                  const progress = completedGoals.length
                    ? `\\nETAPAS JÁ CONCLUÍDAS: ${completedGoals.join("; ")}\\nContinue do estado atual, sem repetir etapas.`
                    : "";
                  const next = await localLlmPlanAccessibility(`${trimmed}${progress}`, screenText, actionController.signal);
                  if (!next.needsAction) return null;
                  if (!next.steps.length) {
                    planningStopReason = next.stopReason || "Preciso de mais informações para continuar com segurança.";
                    return null;
                  }
                  currentGoal = next.goal;
                  return { goal: next.goal, steps: [next.steps[0]] };
                },
              },
            );
            if (awaitingConfirmation) {
              content = "Deixei o texto preenchido e parei antes de enviar. Confira a conversa e o conteúdo; o envio final fica sob seu controle.";
            } else if (!result.ok) {
              content = `Parei após ${result.completed} etapa(s): ${result.message}`;
            } else if (planningStopReason) {
              content = `Concluí ${result.completed} etapa(s). ${planningStopReason}`;
            } else if (completedGoals.length) {
              content = `Concluí ${result.completed} etapa(s) da tarefa. Confira a tela para confirmar o resultado.`;
            }
          }
        } catch (error) {
          if (token.cancelled) return;
          content = `Não consegui executar essa ação offline: ${error instanceof Error ? error.message : "falha no planejador local"}.`;
        }
        if (content) {
          const finalMsgs: ChatMessage[] = [...withUser, { id: uid(), role: "lia", content, createdAt: Date.now(), localOnly: true }];
          setSessionMessages(finalMsgs);
          if (data && cardConnected) persist({ ...data, history: finalMsgs.slice(-200) });
          if (abortRef.current === token) { setSending(false); setState("idle"); }
          return;
        }
      }

      setState("thinking");

      let systemFinal = "";
      let history: { role: "assistant" | "user"; content: string }[] = [];
      try {
        // Recupera lembranças relacionadas ao assunto, usando também o contexto recente
        // do usuário para resolver perguntas de acompanhamento ("e qual era a cor?").
        const memoryQuery = withUser
          .filter((message) => message.role === "user")
          .slice(-5)
          .map((message) => message.content)
          .join("\n");
        const relevantMemories = retrieveRelevantMemories(memoryQuery, memory);
        const system = buildSystemPrompt({
        user,
        profile,
        personality,
        memory: relevantMemories,
        cardConnected,
        vision: "O motor local atual é somente texto. Câmera e interpretação de imagens ainda não estão conectadas ao modelo.",
        memoriaLocal: data?.settings.memoriaLocal ?? null,
        servicos: [
          ...connectedIds.map(connectorLabel),
          ...(whatsappCredsForChat() ? ["WhatsApp"] : []),
          ...((data?.iot?.url || readIot().url) && modules.find((m) => m.id === "automacao")?.ativo ? ["Arduino/ESP32 (ferramenta iot_comando)"] : []),
          ...(serialConnected() ? ["Arduino Uno via USB (ferramenta usb_comando)"] : []),
        ],
        bond: evolveBond(data?.bond, trimmed),
      });
      const extra = readDevSettings().systemPromptExtra.trim();
      // Coleta de contexto nunca pode prender o chat: cada etapa tem prazo curto.
      const within = <T,>(p: Promise<T>, ms: number, fb: T) =>
        Promise.race([p.catch(() => fb), new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
      // Tudo em paralelo e com prazo curto: o contexto nunca atrasa a resposta.
      // Versão leve: sem telemetria, leitura de tela ou ponte do APK a cada mensagem.
      const wantsScreen = /\b(tela|o que está aberto|o que aparece|olha a tela|veja a tela|observe a tela|leia a tela|app aberto|aplicativo aberto)\b/i.test(trimmed);
      const [snap, screen] = await Promise.all([
        within(contextSnapshot(), 300, ""),
        wantsScreen ? nativeScreenSummary(3500) : Promise.resolve(""),
      ]);
      const ctx = [snap, screen ? `LEITURA DA TELA (acessibilidade Android; texto e controles, não pixels):\n${screen}` : ""]
        .filter(Boolean)
        .join("\n\n");
      const usbOn = serialConnected();
      const rooms = `MAQUETE (Arduino): ${ROOMS.map((r) => `${r.nome}=pino ${r.pin}`).join(", ")}. "Quarto grande"/"quarto casal" = Suíte Master; "quarto pequeno" = Quarto de Solteiro. Os comandos USB simples são tratados diretamente pelo app antes de consultar o modelo.`;
      const systemBase = `${system}\n\n${rooms}${ctx ? `\n\nCONTEXTO DO APARELHO (automático, não comente sem motivo)\n${ctx}` : ""}`;
        systemFinal = extra ? `${systemBase}\n\nINSTRUÇÕES EXTRAS DO PAINEL INTERNO\n${extra}` : systemBase;
        history = withUser.slice(-4).map((m) => ({
          role: m.role === "lia" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));
      } catch (error) {
        if (!token.cancelled) {
          const detail = error instanceof Error ? error.message : "erro inesperado";
          setSessionMessages([...withUser, { id: uid(), role: "lia", content: `Não consegui preparar o contexto desta mensagem: ${detail}. Pode tentar novamente?`, createdAt: Date.now() }]);
        }
        if (abortRef.current === token) { setSending(false); setState("idle"); }
        return;
      }

      const streamMessageId = uid();
      let streamedText = "";
      let pendingStreamChunk = "";
      let streamFrame: number | null = null;
      const flushStream = () => {
        if (token.cancelled || !pendingStreamChunk) return;
        streamedText += pendingStreamChunk;
        pendingStreamChunk = "";
        setSessionMessages((prev) =>
          prev.map((message) =>
            message.id === streamMessageId
              ? { ...message, content: stripInternalTags(streamedText), streaming: true }
              : message,
          ),
        );
      };
      setSessionMessages([
        ...withUser,
        { id: streamMessageId, role: "lia", content: "", createdAt: Date.now(), streaming: true },
      ]);

      const controller = new AbortController();
      token.abort = () => controller.abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("LIA_TIMEOUT"));
          }, CHAT_TIMEOUT_MS);
        });
        const res = await Promise.race([
          timeout,
          localLlmReply(systemFinal, history, attachments, controller.signal, (chunk) => {
            if (token.cancelled) return;
            pendingStreamChunk += chunk;
            if (streamFrame === null) {
              streamFrame = requestAnimationFrame(() => {
                streamFrame = null;
                flushStream();
              });
            }
          }),
        ]);
        clearTimeout(timer);
        if (streamFrame !== null) cancelAnimationFrame(streamFrame);
        streamFrame = null;
        flushStream();
        if (token.cancelled) return;
        const { clean, learned } = extractMemories(applyFaceTags(res.text));
        let memorySaved = false;
        let memoryBase = data;
        if (learned.length && res.ok && data && cardConnected && card.isMounted() &&
            data.modules.find((m) => m.id === "memoria")?.ativo) {
          try {
            const candidate: LiaCardData = {
              ...data,
              profiles: data.profiles.map((p) => {
                if (p.id !== data.activeProfileId) return p;
                const updatedMemory = learned.reduce(
                  (items, item) => upsertMemory(items, item, uid, Date.now(), "lia"),
                  p.memory ?? [],
                );
                return { ...p, memory: updatedMemory };
              }),
            };
            card.writeCard(candidate);
            const verified = card.readCard();
            const verifiedProfile = verified?.profiles.find((p) => p.id === verified.activeProfileId);
            memorySaved = Boolean(verifiedProfile && learned.every((item) =>
              findMemoryByExactKey(item.key, verifiedProfile.memory)?.value === item.value,
            ));
            if (memorySaved && verified) {
              memoryBase = verified;
              setData(verified);
            }
          } catch {
            memorySaved = false;
          }
        }
        const liaMsg: ChatMessage = {
          id: uid(),
          role: "lia",
          content: clean || (learned.length
            ? memorySaved
              ? "Informação salva na memória."
              : "Entendi, mas não consegui confirmar que a informação foi salva na memória."
            : "Certo."),
          createdAt: Date.now(),
        };
        const finalMsgs = [...withUser, liaMsg];
        setSessionMessages(finalMsgs);

        if (data && cardConnected) {
          const nextData: LiaCardData = {
            ...memoryBase!,
            history: finalMsgs.slice(-200),
            bond: evolveBond(data.bond, trimmed),
          };
          try {
            card.writeCard(nextData);
            const verifiedHistory = card.readCard();
            setData(verifiedHistory ?? nextData);
            if (nextData.settings.memoriaLocal) {
              void memoryStore.writeMemories(nextData).catch(() => {
                toast.error("Não consegui atualizar o backup externo da memória.");
              });
            }
          } catch {
            if (memorySaved) setData(memoryBase);
            else setData(data);
          }
        }
        setState(res.ok ? "speaking" : "idle");
      } catch (error) {
        if (!token.cancelled) {
          const msg = (error as Error).message;
          const content =
            msg === "LIA_TIMEOUT" || (error as Error).name === "AbortError"
              ? "Demorei demais para pensar nessa e parei para não travar a conversa. Pode tentar de novo?"
              : `Tive um problema de conexão com meu núcleo de linguagem: ${msg}`;
          setSessionMessages((prev) => [
            ...prev.filter((message) => message.id !== streamMessageId),
            { id: uid(), role: "lia", content, createdAt: Date.now() },
          ]);
        }
      } finally {
        clearTimeout(timer);
        if (streamFrame !== null) cancelAnimationFrame(streamFrame);
        if (abortRef.current === token) {
          // Sempre libera a interface, mesmo após erro, timeout ou exceção inesperada.
          setSending(false);
          setState((s) => (s === "thinking" ? "idle" : s));
        }
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
      const msgId = uid();
      setState("thinking");
      const system = buildSystemPrompt({ user, profile, personality, memory, cardConnected, bond: nextBond, memoriaLocal: data?.settings.memoriaLocal ?? null });
      const repetido = data?.bond?.ultimoPetisco === id;
      const ctx = `[EVENTO, não é mensagem do usuário] O usuário acabou de te dar o petisco "${treat.nome}" (${treat.detalhe}) ${treat.emoji}. É o petisco nº ${nextBond.petiscos}.${repetido ? " Já foi dado recentemente — reaja como quem ficou mal-acostumada, mas feliz." : ""}`;
      const history = sessionMessages.slice(-8).map((m) => ({ role: m.role === "lia" ? ("assistant" as const) : ("user" as const), content: m.content }));
      void localLlmReply(system, [...history, { role: "user" as const, content: ctx }])
        .then((res) => extractMemories(applyFaceTags(res.text)).clean)
        .catch((error) => `Não consegui conectar ao motor local: ${error instanceof Error ? error.message : "servidor indisponível"}`)
        .then((content) => {
          setSessionMessages((prev) => [...prev, { id: msgId, role: "lia", content: `${treat.emoji} ${content}`.replace(/^(\S+) \1/, "$1"), createdAt: Date.now() }]);
          setState("speaking");
        });
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