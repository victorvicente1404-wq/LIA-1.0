// Camada local: modelo pequeno (Qwen2.5 0.5B) rodando no próprio navegador via WebGPU.
// Sem cotas, sem chave e sem internet depois do primeiro download (~400 MB, fica em cache).
const FLAG = "lia.local-llm.enabled";
export const LOCAL_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

type Engine = {
  chat: { completions: { create: (o: unknown) => Promise<{ choices: { message: { content: string | null } }[] }> } };
};
let engine: Engine | null = null;
let loading: Promise<Engine> | null = null;

export const localLlmSupported = () => typeof navigator !== "undefined" && "gpu" in navigator;
export const localLlmEnabled = () => typeof localStorage !== "undefined" && localStorage.getItem(FLAG) === "1";
export const localLlmReady = () => !!engine;

export function setLocalLlmEnabled(on: boolean) {
  if (on) localStorage.setItem(FLAG, "1");
  else localStorage.removeItem(FLAG);
}

export function loadLocalLlm(onProgress?: (p: number, text: string) => void): Promise<Engine> {
  if (engine) return Promise.resolve(engine);
  if (!loading) {
    loading = import("@mlc-ai/web-llm")
      .then((m) =>
        m.CreateMLCEngine(LOCAL_MODEL, {
          initProgressCallback: (r: { progress: number; text: string }) => onProgress?.(r.progress, r.text),
        }),
      )
      .then((e) => (engine = e as unknown as Engine))
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

/** Responde localmente; devolve null se a camada estiver desligada ou indisponível. */
export async function localLlmReply(
  system: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string | null> {
  if (!localLlmEnabled() || !localLlmSupported()) return null;
  try {
    const e = await loadLocalLlm();
    const out = await e.chat.completions.create({
      messages: [{ role: "system", content: system.slice(0, 6000) }, ...history.slice(-6)],
      max_tokens: 300,
      temperature: 0.7,
    });
    return out.choices[0]?.message.content?.trim() || null;
  } catch (err) {
    console.error("Modelo local falhou:", (err as Error).message);
    return null;
  }
}
