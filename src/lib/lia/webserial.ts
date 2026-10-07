/** Conexão direta com o Arduino Uno via Web Serial (somente navegador). */
type Cmd = { action: "digital_write" | "pwm" | "digital_read" | "analog_read"; pin: number; value?: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
let port: any = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let buffer = "";
const listeners = new Set<() => void>();

export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;
export const serialConnected = () => !!writer;
export function onSerialChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((f) => f());

export async function connectSerial() {
  port = await (navigator as any).serial.requestPort();
  await port.open({ baudRate: 115200 });
  writer = port.writable.getWriter();
  reader = port.readable.getReader();
  buffer = "";
  port.addEventListener?.("disconnect", () => void disconnectSerial());
  await new Promise((r) => setTimeout(r, 2000)); // o Uno reinicia ao abrir a porta
  emit();
}

export async function disconnectSerial() {
  try { reader?.releaseLock(); writer?.releaseLock(); await port?.close(); } catch { /* já fechada */ }
  port = writer = reader = null;
  emit();
}

async function readLine(timeoutMs: number): Promise<string> {
  const dec = new TextDecoder();
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const i = buffer.indexOf("\n");
    if (i >= 0) { const l = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1); return l; }
    const r = await Promise.race([reader!.read(), new Promise<null>((res) => setTimeout(() => res(null), end - Date.now()))]);
    if (!r || r.done) break;
    buffer += dec.decode(r.value);
  }
  throw new Error("Arduino não respondeu");
}

let queue = Promise.resolve<unknown>(null);
export function sendSerial(cmd: Cmd): Promise<string> {
  const op = { digital_write: "W", pwm: "P", digital_read: "R", analog_read: "A" }[cmd.action];
  const run = async () => {
    if (!writer) throw new Error("Arduino não conectado por USB");
    buffer = "";
    await writer.write(new TextEncoder().encode(`${op} ${cmd.pin} ${cmd.value ?? 0}\n`));
    return readLine(3000);
  };
  const p = queue.then(run, run);
  queue = p.catch(() => null);
  return p;
}
