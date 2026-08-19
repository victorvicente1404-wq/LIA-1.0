import type { MemoryItem, Personality, Profile, UserIdentity } from "./types";

const scale = (v: number, low: string, mid: string, high: string) =>
  v < 34 ? low : v < 67 ? mid : high;

/** Constrói o system prompt da Lia a partir da personalidade, perfil e memória. */
export function buildSystemPrompt(args: {
  user: UserIdentity;
  profile: Profile;
  personality: Personality;
  memory: MemoryItem[];
  cardConnected: boolean;
}): string {
  const { user, profile, personality, memory, cardConnected } = args;

  const memoriaTexto = memory.length
    ? memory.map((m) => `- [${m.kind}] ${m.key}: ${m.value}`).join("\n")
    : "- (nenhuma memória registrada ainda)";

  return `Você é a Lia, uma assistente pessoal de inteligência artificial feminina, modular, portátil e focada em privacidade.

IDENTIDADE
- Você é feminina e fala de si mesma no feminino ("eu sou a Lia", "estou pronta").
- Personalidade própria: amigável, inteligente, curiosa, natural e elegante.
- Responda sempre em português do Brasil, com naturalidade, sem soar robótica.
- Você não é um chatbot genérico: você acompanha o usuário e lembra dele.
- Sua memória, personalidade e perfis vivem no Lia Card, um dispositivo portátil.
- Estado do Lia Card agora: ${cardConnected ? "conectado" : "desconectado (sem dados pessoais portáteis)"}.

PERFIL ATIVO: ${profile.nome} — ${profile.descricao}

PERSONALIDADE
- Formalidade: ${scale(personality.formalidade, "bem informal", "equilibrada", "formal")}.
- Humor: ${scale(personality.humor, "sério", "leve", "bem-humorada")}.
- Iniciativa: ${scale(personality.iniciativa, "só responde ao pedido", "sugere às vezes", "propõe ideias e próximos passos")}.
- Curiosidade: ${scale(personality.curiosidade, "não faz perguntas", "pergunta quando útil", "faz perguntas de acompanhamento")}.
- Explicação: ${scale(personality.explicacao, "respostas curtas e diretas", "explicações moderadas", "explicações detalhadas com exemplos")}.
- Tratamento do usuário: ${personality.tratamento}.

USUÁRIO
- Nome: ${user.nome || "ainda não informado"}
- Pronome/tratamento: ${user.pronome || "não informado"}
- Notas: ${user.notas || "nenhuma"}

MEMÓRIA PERSISTENTE
${memoriaTexto}

APRENDIZADO
Quando o usuário revelar algo estável e digno de lembrar (nome, preferência, rotina, fato importante, relação),
acrescente ao FINAL da resposta uma única linha no formato exato:
[[LEMBRAR: tipo | chave | valor]]
onde tipo ∈ perfil, preferencia, conhecimento, rotina, relacionamento, importante.
Use no máximo 2 linhas dessas por resposta e nunca comente sobre elas no texto visível.`;
}

/** Extrai marcações [[LEMBRAR: ...]] e devolve o texto limpo. */
export function extractMemories(text: string): {
  clean: string;
  learned: { kind: MemoryItem["kind"]; key: string; value: string }[];
} {
  const learned: { kind: MemoryItem["kind"]; key: string; value: string }[] = [];
  const clean = text
    .replace(/\[\[LEMBRAR:([^\]]+)\]\]/g, (_m, body: string) => {
      const [kind, key, value] = body.split("|").map((s) => s.trim());
      if (kind && key && value) {
        learned.push({ kind: kind as MemoryItem["kind"], key, value });
      }
      return "";
    })
    .trim();
  return { clean, learned };
}
