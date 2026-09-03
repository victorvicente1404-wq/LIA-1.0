/**
 * Núcleo da Lia — tipos compartilhados.
 * Esta camada é independente da interface, para permitir que o projeto
 * seja exportado e evoluído fora do Lovable.
 */

export type LiaState = "idle" | "watching" | "listening" | "thinking" | "speaking";

export interface ChatMessage {
  id: string;
  role: "user" | "lia";
  content: string;
  createdAt: number;
}

export interface MemoryItem {
  id: string;
  kind: "perfil" | "preferencia" | "conhecimento" | "rotina" | "relacionamento" | "importante";
  key: string;
  value: string;
  createdAt: number;
  source: "usuario" | "lia";
}

export interface Personality {
  formalidade: number; // 0 informal .. 100 formal
  humor: number;
  iniciativa: number;
  curiosidade: number;
  explicacao: number; // 0 objetiva .. 100 detalhada
  tratamento: string; // como a Lia chama o usuário
}

export type ModuleId =
  | "conversacao"
  | "memoria"
  | "pesquisa"
  | "voz"
  | "visao"
  | "automacao"
  | "rotina"
  | "personalidade";

export interface LiaModule {
  id: ModuleId;
  nome: string;
  descricao: string;
  ativo: boolean;
  permissao: "baixa" | "media" | "alta";
  config: string;
}

export interface Profile {
  id: string;
  nome: string;
  descricao: string;
  personality: Personality;
  modules: Record<ModuleId, boolean>;
  memory: MemoryItem[];
  voz: { ativa: boolean; velocidade: number; tom: number };
  iniciativa: number;
}

export interface UserIdentity {
  nome: string;
  pronome: string;
  notas: string;
}

/** Payload completo gravado no Lia Card (dispositivo portátil). */
export interface LiaCardData {
  version: number;
  cardId: string;
  cardName: string;
  createdAt: number;
  updatedAt: number;
  user: UserIdentity;
  profiles: Profile[];
  activeProfileId: string;
  modules: LiaModule[];
  history: ChatMessage[];
  settings: {
    aiExterna: boolean;
    camera: boolean;
    microfone: boolean;
    animacoes: boolean;
    /** Pasta escolhida pelo usuário para gravar as memórias (nome exibido). */
    memoriaLocal?: string | null;
    /** Palavra de ativação ("Lia") habilitada. */
    wakeWord?: boolean;
    /** Palavra usada para ativar (normalizada: "lia"). */
    wakeWordName?: string;
    /** Sensibilidade do microfone 0–100 (maior = mais sensível). */
    sensibilidade?: number;
    /** Milissegundos de silêncio para finalizar a fala. */
    silencioMs?: number;
  };
}
