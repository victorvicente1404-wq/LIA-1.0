/** Ponte para o plugin Android "LiaNative". Só funciona no APK. */
/* eslint-disable @typescript-eslint/no-explicit-any */

const NATIVE_TIMEOUT_MS = 5_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`tempo esgotado em ${label}`)), NATIVE_TIMEOUT_MS),
    ),
  ]);
}

let plugin: any = null;
async function getPlugin(): Promise<any | null> {
  if (plugin) return plugin;
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
    if (!Capacitor.isPluginAvailable("LiaNative")) return null;
    plugin = registerPlugin<any>("LiaNative");
    return plugin;
  } catch {
    return null;
  }
}

export async function nativeAvailable(): Promise<boolean> {
  return !!(await getPlugin());
}

export async function nativeBatteryStatus(): Promise<{
  level: number;
  charging: boolean;
  plugged: boolean;
  status: string;
} | null> {
  const p = await getPlugin();
  if (!p) return null;
  const result = (await withTimeout(p.batteryStatus(), "consultar bateria")) as {
    level?: number; charging?: boolean; plugged?: boolean; status?: string;
  };
  if (!Number.isFinite(result?.level) || Number(result.level) < 0 || Number(result.level) > 100) {
    throw new Error("O Android retornou um nível de bateria inválido");
  }
  return {
    level: Math.round(Number(result.level)),
    charging: result.charging === true,
    plugged: result.plugged === true,
    status: typeof result.status === "string" ? result.status : "estado desconhecido",
  };
}

export type NativeScreenNode = {
  text?: string;
  description?: string;
  className?: string;
  viewId?: string;
  clickable?: boolean;
  editable?: boolean;
  focusable?: boolean;
  focused?: boolean;
  scrollable?: boolean;
  enabled?: boolean;
  x?: number; y?: number; left?: number; top?: number; right?: number; bottom?: number;
};

export type NativeScreen = {
  app: string;
  lastEventAt: number;
  tree: NativeScreenNode[];
};

export async function nativeReadScreen(): Promise<NativeScreen | null> {
  const p = await getPlugin();
  if (!p) return null;
  const result = (await withTimeout(p.readScreen(), "ler a tela")) as NativeScreen;
  return {
    app: typeof result?.app === "string" ? result.app : "",
    lastEventAt: Number(result?.lastEventAt) || 0,
    tree: Array.isArray(result?.tree) ? result.tree : [],
  };
}

export async function nativeScreenSummary(max = 2500): Promise<string> {
  try {
    const screen = await nativeReadScreen();
    if (!screen) return "";
    const texts = screen.tree
      .filter((node) => node.text || node.description || node.clickable || node.editable)
      .map((node) => {
        const label = node.text || node.description || "(sem rótulo)";
        const flags = [
          node.clickable ? "clicável" : "",
          node.editable ? "campo de texto" : "",
          node.scrollable ? "rolável" : "",
          node.focused ? "focado" : "",
        ].filter(Boolean).join(",");
        return `${label}${flags ? ` [${flags}]` : ""}${node.x != null && node.y != null ? ` @(${node.x},${node.y})` : ""}`;
      });
    return `App em primeiro plano: ${screen.app || "?"}\nElementos visíveis: ${texts.join(" | ").slice(0, max)}`;
  } catch (error) {
    return `Não consegui ler a tela: ${error instanceof Error ? error.message : "permissão de acessibilidade indisponível"}.`;
  }
}

export type NativeCmd = {
  acao: "abrir_app" | "clicar_texto" | "tocar" | "pressionar" | "deslizar" | "digitar" | "rolar" | "voltar" |
    "mostrar_bolha" | "esconder_bolha" | "iniciar_segundo_plano" | "parar_segundo_plano";
  texto?: string;
  direcao?: "cima" | "baixo";
  x?: number; y?: number; x2?: number; y2?: number;
};

export async function runNative(c: NativeCmd): Promise<string | null> {
  const p = await getPlugin();
  if (!p) throw new Error("Essa ação só funciona no app Android da Lia");
  try {
    switch (c.acao) {
      case "abrir_app": {
        const r = (await withTimeout(p.openApp({ name: c.texto ?? "" }), "abrir aplicativo")) as any;
        return r?.ok ? null : `não encontrei o aplicativo "${c.texto ?? ""}"`;
      }
      case "clicar_texto": {
        const r = (await withTimeout(p.clickText({ text: c.texto ?? "" }), "tocar no texto")) as any;
        return r?.ok ? null : `não achei "${c.texto}" na tela`;
      }
      case "tocar":
        await withTimeout(p.tap({ x: c.x ?? 0, y: c.y ?? 0 }), "tocar na tela");
        return null;
      case "pressionar":
        await withTimeout(p.longPress({ x: c.x ?? 0, y: c.y ?? 0 }), "pressionar na tela");
        return null;
      case "deslizar":
        await withTimeout(p.swipe({ x1: c.x ?? 500, y1: c.y ?? 1500, x2: c.x2 ?? 500, y2: c.y2 ?? 500 }), "deslizar");
        return null;
      case "digitar": {
        const r = (await withTimeout(p.setText({ text: c.texto ?? "" }), "preencher campo de texto")) as any;
        return r?.ok ? null : "não encontrei um campo de texto compatível ou o aplicativo não permite preenchê-lo diretamente";
      }
      case "rolar": {
        const r = (await withTimeout(p.scroll({ forward: c.direcao !== "cima" }), "rolar a tela")) as any;
        return r?.ok ? null : "não encontrei uma área rolável na tela";
      }
      case "voltar": {
        const r = (await withTimeout(p.goBack(), "voltar")) as any;
        return r?.ok ? null : "o Android não conseguiu voltar";
      }
      case "mostrar_bolha": await withTimeout(p.showBubble(), "mostrar a bolha"); return null;
      case "esconder_bolha": await withTimeout(p.hideBubble(), "esconder a bolha"); return null;
      case "iniciar_segundo_plano": await withTimeout(p.startBackground(), "iniciar segundo plano"); return null;
      case "parar_segundo_plano": await withTimeout(p.stopBackground(), "parar segundo plano"); return null;
    }
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("tempo esgotado")) return "o celular não respondeu a tempo — tente de novo";
    throw e;
  }
}
