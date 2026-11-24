const STORAGE_KEY = "lia.ai.localEndpoint";
const DEFAULT_ENDPOINT = "http://127.0.0.1:8080";
const REQUEST_TIMEOUT_MS = 120_000;

export type LocalEngineCheck = { ok: true; detail: string } | { ok: false; detail: string };

function normalizeEndpoint(value: string): string {
  const parsed = new URL(value.trim());
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (parsed.protocol !== "http:" || !localHosts.has(parsed.hostname)) {
    throw new Error("Por segurança, o motor deve usar HTTP em localhost/127.0.0.1 neste aparelho.");
  }
  return parsed.origin;
}

export function readLocalEngineUrl(): string {
  if (typeof window === "undefined") return DEFAULT_ENDPOINT;
  try {
    return normalizeEndpoint(window.localStorage.getItem(STORAGE_KEY) || DEFAULT_ENDPOINT);
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

export function writeLocalEngineUrl(value: string): string {
  const endpoint = normalizeEndpoint(value);
  window.localStorage.setItem(STORAGE_KEY, endpoint);
  return endpoint;
}

export async function checkLocalEngine(value = readLocalEngineUrl()): Promise<LocalEngineCheck> {
  let endpoint: string;
  try {
    endpoint = normalizeEndpoint(value);
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Endereço inválido." };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${endpoint}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `llama-server respondeu HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}.` };
    }
    return { ok: true, detail: "llama-server está ativo e aceitando conexões neste aparelho." };
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "O teste expirou. Verifique se o llama-server terminou de carregar o GGUF."
      : "Não consegui alcançar 127.0.0.1. Inicie o llama-server no Termux e confira a permissão de rede local do navegador.";
    return { ok: false, detail };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function localLlmReply(
  system: string,
  history: { role: "user" | "assistant"; content: string }[],
  attachments: { name: string; mime: string; text?: string; dataUrl?: string }[] = [],
  externalSignal?: AbortSignal,
  onChunk?: (chunk: string) => void,
): Promise<{ ok: true; text: string; provider: "llama.cpp" }> {
  const unsupported = attachments.find((item) => item.dataUrl && !item.text);
  if (unsupported) {
    throw new Error(`O modelo local atual é somente texto; ainda não consigo interpretar o anexo "${unsupported.name}".`);
  }

  const attachedText = attachments
    .filter((item) => item.text?.trim())
    .map((item) => `[Anexo: ${item.name}]\n${item.text!.slice(0, 24_000)}`)
    .join("\n\n");

  const messages = history.map((item) => ({ ...item }));
  if (attachedText) {
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    if (lastUser) lastUser.content += `\n\nConteúdo dos anexos:\n${attachedText}`;
  }

  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${readLocalEngineUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        model: "local-model",
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.65,
        top_p: 0.9,
        max_tokens: 256,
        stream: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`llama-server respondeu HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}.`);
    }

    if (!response.body) {
      throw new Error("O navegador não disponibilizou o fluxo de resposta do llama-server.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let streamDone = false;
    const requestStartedAt = performance.now();
    let firstChunkAt: number | null = null;

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trim();
      if (!data) return;
      if (data === "[DONE]") {
        streamDone = true;
        return;
      }

      let payload: {
        choices?: { delta?: { content?: string | { type?: string; text?: string }[] } }[];
        error?: { message?: string };
      };
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
      if (payload.error?.message) throw new Error(payload.error.message);
      const raw = payload.choices?.[0]?.delta?.content;
      const chunk = typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw.map((part) => part.text ?? "").join("")
          : "";
      if (chunk) {
        if (firstChunkAt === null) {
          firstChunkAt = performance.now();
          console.info(`[Lia local] primeiro token em ${Math.round(firstChunkAt - requestStartedAt)} ms`);
        }
        answer += chunk;
        onChunk?.(chunk);
      }
    };

    while (!streamDone) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        processLine(line);
        if (streamDone) break;
      }
    }
    buffer += decoder.decode();
    if (!streamDone && buffer.trim()) processLine(buffer);
    if (streamDone) await reader.cancel().catch(() => undefined);
    console.info(`[Lia local] fluxo encerrado em ${Math.round(performance.now() - requestStartedAt)} ms`);

    if (!answer.trim()) {
      throw new Error("O modelo local respondeu sem texto. Verifique o template de conversa do GGUF.");
    }
    return { ok: true, text: answer.trim(), provider: "llama.cpp" };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(externalSignal?.aborted ? "Geração interrompida." : "O modelo local demorou mais de 120 segundos e a solicitação foi interrompida.");
    }
    if (error instanceof TypeError) {
      throw new Error("Falha ao acessar o llama-server local. Confira se ele está ativo no Termux e se o navegador permitiu acesso à rede local.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", relayAbort);
  }
}

export type LocalAccessibilityPlan = {
  needsAction: boolean;
  goal: string;
  steps: Array<
    | { action: "open_app"; name: string }
    | { action: "read_screen" }
    | { action: "click_text"; text: string }
    | { action: "tap"; x: number; y: number }
    | { action: "long_press"; x: number; y: number }
    | { action: "swipe"; x: number; y: number; x2: number; y2: number }
    | { action: "type_text"; text: string }
    | { action: "scroll"; direction: "up" | "down" }
    | { action: "back" }
  >;
  stopReason?: string;
};

/** Planeja ações Android em JSON; o executor valida cada etapa e nunca envia formulários/mensagens finais. */
export async function localLlmPlanAccessibility(
  request: string,
  screen: string,
  externalSignal?: AbortSignal,
): Promise<LocalAccessibilityPlan> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), 45_000);

  const instructions = [
    "Você é o planejador de ações Android offline da Lia.",
    "Responda SOMENTE um objeto JSON válido, sem Markdown.",
    'Formato: {"needsAction":boolean,"goal":"...","steps":[...],"stopReason":"..."}',
    "Ações permitidas: open_app{name}, read_screen, click_text{text}, tap{x,y}, long_press{x,y}, swipe{x,y,x2,y2}, type_text{text}, scroll{direction:'up'|'down'}, back.",
    "Planeje no máximo 8 etapas. Use os rótulos reais da tela; se não souber o próximo controle, use read_screen e pare para nova observação.",
    "Não invente coordenadas: prefira click_text. Não invente nomes de apps nem destinatários.",
    "Nunca execute o toque final de enviar/publicar/comprar/apagar/confirmar pagamento ou qualquer ação irreversível.",
    "Se o usuário pedir para enviar mensagem, pode abrir o app, localizar a conversa e preencher o texto fornecido, mas pare antes do botão Enviar e explique que aguardará confirmação.",
    "Se faltar destinatário, texto, aplicativo ou outra informação essencial, retorne needsAction=false e explique em stopReason.",
    "Perguntas sobre como fazer algo não são comandos para executar: needsAction=false.",
    "Não tente contornar login, autenticação, CAPTCHA, bloqueios ou permissões do Android.",
    "Se a tela atual não for suficiente para determinar com segurança a próxima ação, retorne apenas etapas seguras ou needsAction=false.",
  ].join("\n");

  try {
    const response = await fetch(`${readLocalEngineUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        model: "local-model",
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: `PEDIDO: ${request}\n\nTELA ATUAL:\n${screen || "(não disponível)"}` },
        ],
        temperature: 0.1,
        top_p: 0.8,
        max_tokens: 512,
        stream: false,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`Planejador local respondeu HTTP ${response.status}.`);
    const payload = await response.json() as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (payload.error?.message) throw new Error(payload.error.message);
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("O planejador local não retornou um plano.");
    const parsed = JSON.parse(content) as LocalAccessibilityPlan;
    if (typeof parsed.needsAction !== "boolean" || !Array.isArray(parsed.steps) ||
        parsed.steps.length > 8 || typeof parsed.goal !== "string") {
      throw new Error("O planejador retornou uma estrutura inválida.");
    }
    return parsed;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(externalSignal?.aborted ? "Planejamento interrompido." : "O planejamento de ações expirou após 45 segundos.");
    }
    if (error instanceof TypeError) {
      throw new Error("Não consegui acessar o planejador local no Termux.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", relayAbort);
  }
}
