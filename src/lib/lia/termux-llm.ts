const STORAGE_KEY = "lia.ai.localEndpoint";
const DEFAULT_ENDPOINT = "http://127.0.0.1:8080";
const REQUEST_TIMEOUT_MS = 60_000;

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
): Promise<{ ok: true; text: string; provider: "llama.cpp" }> {
  const unsupported = attachments.find((item) => item.dataUrl && !item.text);
  if (unsupported) {
    throw new Error(`O modelo local atual é somente texto; ainda não consigo interpretar o anexo "${unsupported.name}".`);
  }

  const attachedText = attachments
    .filter((item) => item.text?.trim())
    .map((item) => `[Anexo: ${item.name}]\\n${item.text!.slice(0, 24_000)}`)
    .join("\\n\\n");

  const messages = history.map((item) => ({ ...item }));
  if (attachedText) {
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    if (lastUser) lastUser.content += `\\n\\nConteúdo dos anexos:\\n${attachedText}`;
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
        temperature: 0.7,
        max_tokens: 512,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`llama-server respondeu HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}.`);
    }

    const payload = await response.json() as {
      choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
      error?: { message?: string };
    };
    const raw = payload.choices?.[0]?.message?.content;
    const answer = typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.map((part) => part.text ?? "").join("")
        : "";

    if (!answer.trim()) {
      throw new Error(payload.error?.message || "O modelo local respondeu sem texto. Verifique o template de conversa do GGUF.");
    }
    return { ok: true, text: answer.trim(), provider: "llama.cpp" };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(externalSignal?.aborted ? "Geração interrompida." : "O modelo local demorou mais de 60 segundos e a solicitação foi interrompida.");
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
