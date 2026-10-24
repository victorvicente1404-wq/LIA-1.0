import { afterEach, describe, expect, it, vi } from "vitest";
import { connectSerial, disconnectSerial, sendSerial } from "./webserial";

vi.mock("./device", () => ({ keepAwake: vi.fn(), setRoomState: vi.fn() }));

afterEach(async () => {
  await disconnectSerial();
  vi.useRealTimers();
});

describe("comandos manuais USB", () => {
  it("envia HIGH e LOW nos cinco pinos da maquete e recebe a confirmação", async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    let input: ReadableStreamDefaultController<Uint8Array> | undefined;
    const readable = new ReadableStream<Uint8Array>({ start(controller) { input = controller; } });
    const writable = new WritableStream<Uint8Array>({
      write(bytes) {
        const command = new TextDecoder().decode(bytes);
        writes.push(command);
        setTimeout(() => input?.enqueue(new TextEncoder().encode(`${command.trim().split(" ")[2]}\n`)), 20);
      },
    });
    const connection = connectSerial({ readable, writable, close: async () => {} });
    await vi.advanceTimersByTimeAsync(2000);
    await connection;
    for (const pin of [2, 3, 4, 5, 6]) {
      for (const value of [1, 0]) {
        const response = sendSerial({ action: "digital_write", pin, value });
        await vi.advanceTimersByTimeAsync(20);
        expect(await response).toBe(String(value));
        expect(writes.at(-1)).toBe(`W ${pin} ${value}\n`);
      }
    }
    expect(writes).toHaveLength(10);
  });
});