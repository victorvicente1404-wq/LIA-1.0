/** Chaves de IA próprias do usuário: ficam só neste navegador e vão ao servidor apenas na hora de responder. */
const KEY = "lia.user.gemini";
const GROQ = "lia.user.groq";

function read(k: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}
function write(k: string, value: string): void {
  if (typeof window === "undefined") return;
  const v = value.trim();
  if (v) window.localStorage.setItem(k, v);
  else window.localStorage.removeItem(k);
}

export const readUserGeminiKey = () => read(KEY);
export const writeUserGeminiKey = (v: string) => write(KEY, v);
export const readUserGroqKey = () => read(GROQ);
export const writeUserGroqKey = (v: string) => write(GROQ, v);
