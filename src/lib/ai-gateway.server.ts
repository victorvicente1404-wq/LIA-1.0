import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Conexão com o Lovable AI Gateway (somente servidor). */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}
