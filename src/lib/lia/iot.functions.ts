import { createServerFn } from "@tanstack/react-start";
import { IotSchema } from "./iot";

/** Botão "Ping/Testar" do módulo IoT. */
export const iotTest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IotSchema.parse(input))
  .handler(async ({ data }) => {
    const { iotPing } = await import("./iot.server");
    try {
      return await iotPing(data);
    } catch (e) {
      return { ok: false, status: 0, ms: 0, body: (e as Error).message };
    }
  });
