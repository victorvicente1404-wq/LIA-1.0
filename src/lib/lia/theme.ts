/** Personalização visual: modo (fundo) + cor de destaque. */
export const THEMES = [
  { id: "lia", nome: "Lia (padrão)" },
  { id: "midnight", nome: "Midnight" },
  { id: "amoled", nome: "Amoled" },
  { id: "claro", nome: "Claro" },
] as const;

export const ACCENTS = [
  { id: "roxo", nome: "Roxo", hue: 300, css: "oklch(0.58 0.21 300)" },
  { id: "azul", nome: "Azul", hue: 262, css: "oklch(0.58 0.21 262)" },
  { id: "ciano", nome: "Ciano", hue: 205, css: "oklch(0.6 0.15 205)" },
  { id: "verde", nome: "Verde", hue: 155, css: "oklch(0.6 0.15 155)" },
  { id: "ambar", nome: "Âmbar", hue: 75, css: "oklch(0.68 0.16 75)" },
  { id: "rosa", nome: "Rosa", hue: 350, css: "oklch(0.62 0.2 350)" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type AccentId = (typeof ACCENTS)[number]["id"];

const KEY = "lia.theme";

export interface ThemeChoice {
  theme: ThemeId;
  accent: AccentId;
}

export const defaultTheme: ThemeChoice = { theme: "lia", accent: "roxo" };

export function readTheme(): ThemeChoice {
  if (typeof window === "undefined") return defaultTheme;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...defaultTheme, ...(JSON.parse(raw) as Partial<ThemeChoice>) } : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset["theme"] = choice.theme;
  const accent = ACCENTS.find((a) => a.id === choice.accent) ?? ACCENTS[0];
  root.style.setProperty("--h", String(accent.hue));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    /* sem armazenamento: o tema vale só nesta sessão */
  }
}
