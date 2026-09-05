/** Configurações internas do painel de desenvolvimento (acesso por senha). */
export interface DevSettings {
  email: string;
  systemPromptExtra: string;
  debug: boolean;
}

const KEY = "lia.dev.settings";

export const DEV_PASSWORD = "CARD1404";

export const defaultDevSettings: DevSettings = {
  email: "lia.assistente.ai@gmail.com",
  systemPromptExtra: "",
  debug: false,
};

export function readDevSettings(): DevSettings {
  if (typeof window === "undefined") return defaultDevSettings;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultDevSettings;
    return { ...defaultDevSettings, ...(JSON.parse(raw) as Partial<DevSettings>) };
  } catch {
    return defaultDevSettings;
  }
}

export function writeDevSettings(next: DevSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
}
