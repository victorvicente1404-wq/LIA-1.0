/** Chave Gemini própria do usuário: fica só neste navegador e vai ao servidor apenas na hora de responder. */
const KEY = "lia.user.gemini";

export function readUserGeminiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeUserGeminiKey(value: string): void {
  if (typeof window === "undefined") return;
  const v = value.trim();
  if (v) window.localStorage.setItem(KEY, v);
  else window.localStorage.removeItem(KEY);
}
