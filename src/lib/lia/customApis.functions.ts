import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CustomApiSchema } from "./custom-apis";

export const testCustomApi = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ api: CustomApiSchema, params: z.record(z.string(), z.unknown()).default({}) }).parse(i))
  .handler(async ({ data }) => {
    const { callCustomTool } = await import("./customApis.server");
    try {
      return await callCustomTool(data.api, data.params, 10_000);
    } catch (e) {
      return { ok: false, status: 0, ms: 0, body: (e as Error).message };
    }
  });

export const testCustomProvider = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ api: CustomApiSchema }).parse(i))
  .handler(async ({ data }) => {
    const { callCustomProvider } = await import("./customApis.server");
    const started = Date.now();
    try {
      const text = await callCustomProvider(data.api, "Responda em uma frase curta.", [{ role: "user", content: "Diga oi." }], 8_000);
      return { ok: true, ms: Date.now() - started, body: text.slice(0, 500) };
    } catch (e) {
      return { ok: false, ms: Date.now() - started, body: (e as Error).message };
    }
  });
