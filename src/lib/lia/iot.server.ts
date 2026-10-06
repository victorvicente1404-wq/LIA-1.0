/** Comandos HTTP padronizados para a ponte Arduino/ESP32 (somente servidor). */
import { tool } from "ai";
import { z } from "zod";
import type { IotConfig } from "./types";
import { assertSafeUrl } from "./customApis.server";

function endpoint(cfg: IotConfig, path: string) {
  const base = assertSafeUrl(cfg.url);
  return new URL(`${base.pathname.replace(/\/+$/, "")}${path}`, base.origin);
}

function headers(cfg: IotConfig) {
  const h = new Headers({ "content-type": "application/json", "ngrok-skip-browser-warning": "1" });
  if (cfg.token) h.set("authorization", `Bearer ${cfg.token}`);
  return h;
}

async function read(res: Response) {
  const t = (await res.text()).slice(0, 4000);
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return t;
  }
}

export async function iotPing(cfg: IotConfig) {
  const started = Date.now();
  const res = await fetch(endpoint(cfg, "/status"), { headers: headers(cfg), redirect: "manual", signal: AbortSignal.timeout(6_000) });
  return { ok: res.ok, status: res.status, ms: Date.now() - started, body: await read(res) };
}

export const IotAction = z.enum(["digital_write", "pwm", "digital_read", "analog_read"]);

export async function iotCommand(cfg: IotConfig, cmd: { action: z.infer<typeof IotAction>; pin: number; value?: number | undefined }) {
  const res = await fetch(endpoint(cfg, "/cmd"), {
    method: "POST",
    headers: headers(cfg),
    redirect: "manual",
    body: JSON.stringify({ action: cmd.action, pin: cmd.pin, value: cmd.value ?? 0 }),
    signal: AbortSignal.timeout(8_000),
  });
  return { ok: res.ok, status: res.status, body: await read(res) };
}

export function buildIotTools(cfg: IotConfig) {
  return {
    iot_comando: tool({
      description:
        "Controla o Arduino/ESP32 do usuário. digital_write liga (1) ou desliga (0) um pino/relé; pwm ajusta intensidade 0-255 (LED, motor); digital_read lê botão/entrada; analog_read lê sensor analógico. Execute direto quando o usuário pedir e informe o resultado.",
      inputSchema: z.object({
        action: IotAction,
        pin: z.number().int().min(0).max(99),
        value: z.number().int().min(0).max(255).optional(),
      }),
      execute: async (input) => {
        try {
          return await iotCommand(cfg, input);
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
    }),
    iot_status: tool({
      description: "Verifica se o Arduino/ESP32 está online.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await iotPing(cfg);
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
    }),
  };
}
