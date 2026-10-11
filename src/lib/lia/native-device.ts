/** Ponte para o plugin Android "LiaNative" (pasta native-android). Só funciona no APK. */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
    const { app, tree } = await p.readScreen();
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
    return ""; // acessibilidade desligada
  }
}

export type NativeCmd = {
  acao: "clicar_texto" | "tocar" | "deslizar" | "mostrar_bolha" | "esconder_bolha" | "iniciar_segundo_plano" | "parar_segundo_plano";
  texto?: string; x?: number; y?: number; x2?: number; y2?: number;
};

export async function runNative(c: NativeCmd): Promise<string | null> {
  const p = await getPlugin();
  if (!p) throw new Error("Essa ação só funciona no app Android da Lia");
  switch (c.acao) {
    case "clicar_texto": {
      const r = await p.clickText({ text: c.texto ?? "" });
      return r?.ok ? null : `não achei "${c.texto}" na tela`;
    }
    case "tocar": await p.tap({ x: c.x ?? 0, y: c.y ?? 0 }); return null;
    case "deslizar": await p.swipe({ x1: c.x ?? 500, y1: c.y ?? 1500, x2: c.x2 ?? 500, y2: c.y2 ?? 500 }); return null;
    case "mostrar_bolha": await p.showBubble(); return null;
    case "esconder_bolha": await p.hideBubble(); return null;
    case "iniciar_segundo_plano": await p.startBackground(); return null;
    case "parar_segundo_plano": await p.stopBackground(); return null;
  }
}
