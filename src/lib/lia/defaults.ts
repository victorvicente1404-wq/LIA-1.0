import type { LiaCardData, LiaModule, ModuleId, Personality, Profile } from "./types";
import { defaultVoiceSettings } from "./voice/types";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const defaultPersonality: Personality = {
  formalidade: 35,
  humor: 60,
  iniciativa: 55,
  curiosidade: 75,
  explicacao: 50,
  tratamento: "pelo nome",
};

export const defaultModules: LiaModule[] = [
  {
    id: "conversacao",
    nome: "Conversação",
    descricao: "Diálogo natural, contexto e continuidade das conversas.",
    ativo: true,
    permissao: "baixa",
    config: "Modelo de linguagem via Lovable AI",
  },
  {
    id: "memoria",
    nome: "Memória",
    descricao: "Aprende e mantém informações do usuário entre sessões.",
    ativo: true,
    permissao: "alta",
    config: "Persistência no Lia Card",
  },
  {
    id: "pesquisa",
    nome: "Pesquisa",
    descricao: "Busca e sintetiza informações externas.",
    ativo: false,
    permissao: "media",
    config: "Requer conexão externa",
  },
  {
    id: "voz",
    nome: "Voz",
    descricao: "Escuta por microfone e fala sintetizada, com interrupção.",
    ativo: true,
    permissao: "alta",
    config: "Web Speech API local do navegador",
  },
  {
    id: "visao",
    nome: "Visão",
    descricao: "Sistema visual da Lia: câmera, presença e ambiente.",
    ativo: false,
    permissao: "alta",
    config: "Processamento local — reconhecimento facial futuro",
  },
  {
    id: "automacao",
    nome: "Automação",
    descricao: "Ações no computador e dispositivos (Arduino, ESP32).",
    ativo: false,
    permissao: "alta",
    config: "Reservado para expansão",
  },
  {
    id: "rotina",
    nome: "Rotina",
    descricao: "Reconhece padrões do dia a dia e antecipa necessidades.",
    ativo: false,
    permissao: "media",
    config: "Reservado para expansão",
  },
  {
    id: "personalidade",
    nome: "Personalidade",
    descricao: "Traços, tom e comportamento da Lia.",
    ativo: true,
    permissao: "baixa",
    config: "Configurável por perfil",
  },
];

const moduleFlags = (overrides: Partial<Record<ModuleId, boolean>> = {}) =>
  defaultModules.reduce(
    (acc, m) => ({ ...acc, [m.id]: overrides[m.id] ?? m.ativo }),
    {} as Record<ModuleId, boolean>,
  );

const makeProfile = (
  id: string,
  nome: string,
  descricao: string,
  personality: Partial<Personality>,
  modules: Partial<Record<ModuleId, boolean>> = {},
): Profile => ({
  id,
  nome,
  descricao,
  personality: { ...defaultPersonality, ...personality },
  modules: moduleFlags(modules),
  memory: [],
  voz: { ativa: true, velocidade: 1, tom: 1.05 },
  iniciativa: personality.iniciativa ?? defaultPersonality.iniciativa,
});

export const defaultProfiles: Profile[] = [
  makeProfile("pessoal", "Pessoal", "Conversa leve, cotidiano e organização pessoal.", {}),
  makeProfile("estudos", "Estudos", "Explicações detalhadas, foco e revisão.", {
    formalidade: 45,
    humor: 35,
    explicacao: 85,
    curiosidade: 85,
  }),
  makeProfile("trabalho", "Trabalho", "Objetiva, formal e produtiva.", {
    formalidade: 75,
    humor: 20,
    explicacao: 35,
    iniciativa: 65,
  }),
  makeProfile("casa", "Casa", "Ambiente doméstico, rotina e automação.", {
    formalidade: 20,
    humor: 70,
    iniciativa: 75,
  }),
];

export const createCardData = (cardName = "Lia Card"): LiaCardData => ({
  version: 1,
  cardId: uid().toUpperCase(),
  cardName,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  user: { nome: "", pronome: "", notas: "" },
  profiles: defaultProfiles,
  activeProfileId: "pessoal",
  modules: defaultModules,
  history: [],
  settings: {
    aiExterna: true,
    camera: false,
    microfone: false,
    animacoes: true,
    memoriaLocal: null,
    voz: { ...defaultVoiceSettings },
  },
});
