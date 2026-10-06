import { createServerFn } from "@tanstack/react-start";
import { IotSchema } from "./iot";

/** Botão "Ping/Testar" do módulo IoT. */
export const iotTest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IotSchema.parse(input))
  .handler(async ({ data }) => {
    const { iotPing } = await import("./iot.server");
    try {
      const r = await iotPing(data);
      return { ...r, body: typeof r.body === "string" ? r.body : JSON.stringify(r.body) };
    } catch (e) {
      return { ok: false, status: 0, ms: 0, body: (e as Error).message };
    }
  });
