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
  options: { signal?: AbortSignal; onStep?: (index: number, step: AccessibilityStep) => void } = {},
): Promise<AccessibilityRunResult> {
  if (execution) {
    return { ok: false, completed: 0, message: "Já existe uma ação da Lia controlando a tela. Aguarde ou interrompa a execução atual." };
  }
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 12) {
    return { ok: false, completed: 0, message: "Plano inválido: são permitidas de 1 a 12 etapas." };
  }

  const lease = { id: nextExecutionId++, cancelled: false };
  execution = lease;
  const abort = () => { lease.cancelled = true; };
  options.signal?.addEventListener("abort", abort, { once: true });
  let completed = 0;
  let screen: NativeScreen | null = null;

  try {
    for (const step of plan.steps) {
      if (lease.cancelled || options.signal?.aborted) {
        return { ok: false, completed, message: "Execução interrompida.", screen };
      }
      if (!step || typeof step !== "object") {
        return { ok: false, completed, message: "O modelo retornou uma etapa inválida.", screen };
      }
      options.onStep?.(completed, step);
      if (step.action === "read_screen") {
        screen = await nativeReadScreen();
        if (!screen) return { ok: false, completed, message: "A acessibilidade Android não está disponível. Ative o serviço da Lia nas Configurações.", screen };
        completed++;
        continue;
      }

      let command: NativeCmd;
      switch (step.action) {
        case "open_app":
          if (!validText(step.name, 1, 80)) return invalidStep();
          command = { acao: "abrir_app", texto: step.name };
          break;
        case "click_text":
          if (!validText(step.text, 1, 160)) return invalidStep();
          command = { acao: "clicar_texto", texto: step.text };
          break;
        case "tap":
        case "long_press":
          if (!validPoint(step.x, step.y)) return invalidStep();
          command = { acao: step.action === "tap" ? "tocar" : "pressionar", x: step.x, y: step.y };
          break;
        case "swipe":
          if (!validPoint(step.x, step.y) || !validPoint(step.x2, step.y2)) return invalidStep();
          command = { acao: "deslizar", x: step.x, y: step.y, x2: step.x2, y2: step.y2 };
          break;
        case "type_text":
          if (!validText(step.text, 0, 4000)) return invalidStep();
          command = { acao: "digitar", texto: step.text };
          break;
        case "scroll":
          if (step.direction !== "up" && step.direction !== "down") return invalidStep();
          command = { acao: "rolar", direcao: step.direction === "up" ? "cima" : "baixo" };
          break;
        case "back":
          command = { acao: "voltar" };
          break;
        default:
          return invalidStep();
      }

      const failure = await runNative(command);
      if (failure) return { ok: false, completed, message: failure, screen };
      completed++;
      // Atualiza a observação após cada ação: não executa uma sequência cega.
      screen = await nativeReadScreen();
      if (lease.cancelled || options.signal?.aborted) {
        return { ok: false, completed, message: "Execução interrompida.", screen };
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

function invalidStep(): AccessibilityRunResult {
  return { ok: false, completed: 0, message: "O plano contém parâmetros inválidos; nenhuma etapa adicional foi executada." };
}
