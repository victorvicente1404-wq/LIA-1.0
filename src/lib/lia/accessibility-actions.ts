import { nativeReadScreen, runNative, type NativeCmd, type NativeScreen } from "./native-device";

export type AccessibilityStep =
  | { action: "open_app"; name: string }
  | { action: "read_screen" }
  | { action: "click_text"; text: string }
  | { action: "tap"; x: number; y: number }
  | { action: "long_press"; x: number; y: number }
  | { action: "swipe"; x: number; y: number; x2: number; y2: number }
  | { action: "type_text"; text: string }
  | { action: "scroll"; direction: "up" | "down" }
  | { action: "back" };

export type AccessibilityPlan = {
  goal: string;
  steps: AccessibilityStep[];
};

export type AccessibilityRunResult = {
  ok: boolean;
  completed: number;
  message: string;
  screen?: NativeScreen | null;
};

let execution: { id: number; cancelled: boolean } | null = null;
let nextExecutionId = 1;

/** Uma única execução de UI pode controlar o Android por vez. */
export async function runAccessibilityPlan(
  plan: AccessibilityPlan,
  options: {
    signal?: AbortSignal;
    initialScreen?: NativeScreen | null;
    onStep?: (index: number, step: AccessibilityStep) => void;
    nextPlan?: (screen: NativeScreen, completed: number) => Promise<AccessibilityPlan | null>;
  } = {},
): Promise<AccessibilityRunResult> {
  if (execution) {
    return { ok: false, completed: 0, message: "Já existe uma ação da Lia controlando a tela. Aguarde ou interrompa a execução atual." };
  }
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 8) {
    return { ok: false, completed: 0, message: "Plano inválido: são permitidas de 1 a 8 etapas." };
  }

  const lease = { id: nextExecutionId++, cancelled: false };
  execution = lease;
  const abort = () => { lease.cancelled = true; };
  options.signal?.addEventListener("abort", abort, { once: true });
  let completed = 0;
  let screen: NativeScreen | null = options.initialScreen ?? null;
  let pending = [...plan.steps];

  try {
    while (pending.length > 0) {
      if (lease.cancelled || options.signal?.aborted) {
        return { ok: false, completed, message: "Execução interrompida.", screen };
      }
      const step = pending.shift()!;
      if (!step || typeof step !== "object") {
        return { ok: false, completed, message: "O modelo retornou uma etapa inválida.", screen };
      }
      options.onStep?.(completed, step);

      if (step.action === "read_screen") {
        screen = await nativeReadScreen();
        if (!screen) return { ok: false, completed, message: "A acessibilidade Android não está disponível. Ative o serviço da Lia nas Configurações.", screen };
        completed++;
      } else {
        let command: NativeCmd;
        switch (step.action) {
          case "open_app":
            if (!validText(step.name, 1, 80)) return { ok: false, completed, message: "Nome de aplicativo inválido.", screen };
            command = { acao: "abrir_app", texto: step.name };
            break;
          case "click_text":
            if (!validText(step.text, 1, 160)) return { ok: false, completed, message: "Texto de controle inválido.", screen };
            if (/\b(enviar|send|publicar|postar|comprar|pagar|confirmar|excluir|apagar|remover|finalizar)\b/i.test(step.text.trim())) {
              return { ok: false, completed, message: "Parei antes de uma ação final que exige sua confirmação.", screen };
            }
            command = { acao: "clicar_texto", texto: step.text };
            break;
          case "tap":
          case "long_press":
            if (!validPoint(step.x, step.y) || !isClickablePoint(screen, step.x, step.y)) {
              return { ok: false, completed, message: "Recusei o toque: as coordenadas não correspondem a um controle clicável visível.", screen };
            }
            command = { acao: step.action === "tap" ? "tocar" : "pressionar", x: step.x, y: step.y };
            break;
          case "swipe":
            if (!validPoint(step.x, step.y) || !validPoint(step.x2, step.y2) || !isScrollablePoint(screen, step.x, step.y)) {
              return { ok: false, completed, message: "Recusei o gesto: o ponto inicial não está dentro de uma área rolável visível.", screen };
            }
            command = { acao: "deslizar", x: step.x, y: step.y, x2: step.x2, y2: step.y2 };
            break;
          case "type_text":
            if (!validText(step.text, 0, 4000)) return { ok: false, completed, message: "Texto para preencher inválido.", screen };
            command = { acao: "digitar", texto: step.text };
            break;
          case "scroll":
            if (step.direction !== "up" && step.direction !== "down") return { ok: false, completed, message: "Direção de rolagem inválida.", screen };
            command = { acao: "rolar", direcao: step.direction === "up" ? "cima" : "baixo" };
            break;
          case "back":
            command = { acao: "voltar" };
            break;
          default:
            return { ok: false, completed, message: "Ação não reconhecida.", screen };
        }

        const failure = await runNative(command);
        if (failure) return { ok: false, completed, message: failure, screen };
        completed++;
        screen = await nativeReadScreen();
        if (!screen) return { ok: false, completed, message: "A ação ocorreu, mas perdi acesso à tela. Interrompi para não continuar às cegas.", screen };
      }

      if (lease.cancelled || options.signal?.aborted) {
        return { ok: false, completed, message: "Execução interrompida.", screen };
      }

      if (options.nextPlan && screen) {
        const next = await options.nextPlan(screen, completed);
        if (!next) break;
        if (!Array.isArray(next.steps) || next.steps.length < 1 || next.steps.length > 1) {
          return { ok: false, completed, message: "O planejador não retornou exatamente a próxima etapa. Interrompi por segurança.", screen };
        }
        pending = [...next.steps];
      }
    }
    return { ok: true, completed, message: "Etapas concluídas.", screen };
  } catch (error) {
    return {
      ok: false,
      completed,
      message: error instanceof Error ? error.message : "Falha inesperada ao controlar a tela.",
      screen,
    };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    if (execution?.id === lease.id) execution = null;
  }
}

export function cancelAccessibilityExecution(): boolean {
  if (!execution) return false;
  execution.cancelled = true;
  return true;
}

function validText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function validPoint(x: unknown, y: unknown): boolean {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 10000 &&
    typeof y === "number" && Number.isFinite(y) && y >= 0 && y <= 10000;
}

function containsPoint(node: NativeScreen["tree"][number], x: number, y: number): boolean {
  return typeof node.left === "number" && typeof node.top === "number" &&
    typeof node.right === "number" && typeof node.bottom === "number" &&
    x >= node.left && x <= node.right && y >= node.top && y <= node.bottom;
}

function isClickablePoint(screen: NativeScreen | null, x: number, y: number): boolean {
  return Boolean(screen?.tree.some((node) => node.clickable && node.enabled !== false && containsPoint(node, x, y)));
}

function isScrollablePoint(screen: NativeScreen | null, x: number, y: number): boolean {
  return Boolean(screen?.tree.some((node) => node.scrollable && node.enabled !== false && containsPoint(node, x, y)));
}
