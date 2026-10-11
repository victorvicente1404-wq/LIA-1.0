/** Ponte para o plugin Android "LiaNative" (pasta native-android). Só funciona no APK. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Trava de segurança: nenhuma chamada nativa pode esperar mais que 2s. */
const NATIVE_TIMEOUT_MS = 2_000;

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

/** Resumo curto da tela atual (app + textos visíveis) para o contexto da Lia. */
export async function nativeScreenSummary(max = 1500): Promise<string> {
  const p = await getPlugin();
  if (!p) return "";
  try {
    const { app, tree } = (await withTimeout(p.readScreen(), "ler a tela")) as any;
    const texts: string[] = [];
    const walk = (n: any) => {
      if (!n) return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (typeof n === "string") return void texts.push(n);
      const t = n.text ?? n.desc ?? n.label;
      if (t) texts.push(String(t) + (n.x != null && n.y != null ? ` @(${n.x},${n.y})` : ""));
      walk(n.children);
    };
    walk(tree);
    return `App em primeiro plano: ${app ?? "?"}\nTextos visíveis: ${texts.join(" | ").slice(0, max)}`;
  } catch {
    return ""; // acessibilidade desligada ou sem resposta em 2s
  }
}

export type NativeCmd = {
  acao: "clicar_texto" | "tocar" | "deslizar" | "mostrar_bolha" | "esconder_bolha" | "iniciar_segundo_plano" | "parar_segundo_plano";
  texto?: string; x?: number; y?: number; x2?: number; y2?: number;
};

export async function runNative(c: NativeCmd): Promise<string | null> {
  const p = await getPlugin();
  if (!p) throw new Error("Essa ação só funciona no app Android da Lia");
  try {
    switch (c.acao) {
      case "clicar_texto": {
        const r = (await withTimeout(p.clickText({ text: c.texto ?? "" }), "tocar no texto")) as any;
        return r?.ok ? null : `não achei "${c.texto}" na tela`;
      }
      case "tocar": await withTimeout(p.tap({ x: c.x ?? 0, y: c.y ?? 0 }), "tocar na tela"); return null;
      case "deslizar": await withTimeout(p.swipe({ x1: c.x ?? 500, y1: c.y ?? 1500, x2: c.x2 ?? 500, y2: c.y2 ?? 500 }), "deslizar"); return null;
      case "mostrar_bolha": await withTimeout(p.showBubble(), "mostrar a bolha"); return null;
      case "esconder_bolha": await withTimeout(p.hideBubble(), "esconder a bolha"); return null;
      case "iniciar_segundo_plano": await withTimeout(p.startBackground(), "iniciar segundo plano"); return null;
      case "parar_segundo_plano": await withTimeout(p.stopBackground(), "parar segundo plano"); return null;
    }
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("tempo esgotado")) {
      return "o celular não respondeu a tempo — tente de novo";
    }
    // Erros do próprio plugin (permissão de acessibilidade/sobreposição) sobem com a mensagem original.
    throw e;
  }
}
