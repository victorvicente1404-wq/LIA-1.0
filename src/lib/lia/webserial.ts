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
const awake = (on: boolean) => void import("./device").then((d) => d.keepAwake(on));
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => { if (writer && document.visibilityState === "visible") awake(true); });

/** Reabre sozinha a porta já autorizada antes (sem o seletor). */
export async function autoReconnectSerial() {
  if (!serialSupported() || writer) return false;
  try {
    const ports = await (navigator as any).serial.getPorts();
    if (!ports.length) return false;
    await connectSerial(ports[0]);
    return true;
  } catch { return false; }
}
if (typeof window !== "undefined") setTimeout(() => void autoReconnectSerial(), 1500);

let waiters: Array<(l: string) => void> = [];

/** Leitor contínuo: uma única leitura ativa, nunca trava a porta. */
async function readLoop() {
  const dec = new TextDecoder();
  try {
    while (reader) {
      const r = await reader.read();
      if (r.done) break;
      buffer += dec.decode(r.value, { stream: true });
      let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (line) waiters.shift()?.(line);
      }
    }
  } catch { /* porta fechada */ }
}

export async function connectSerial(existing?: any) {
  port = existing ?? (await (navigator as any).serial.requestPort());
  if (!port.readable) await port.open({ baudRate: 115200 });
  writer = port.writable.getWriter();
  reader = port.readable.getReader();
  buffer = "";
  waiters = [];
  port.addEventListener?.("disconnect", () => void disconnectSerial());
  await new Promise((r) => setTimeout(r, 2000)); // o Uno reinicia ao abrir a porta
  buffer = ""; // descarta ruído do bootloader
  void readLoop();
  awake(true);
  emit();
}

export async function disconnectSerial() {
  try { await reader?.cancel(); } catch { /* */ }
  try { reader?.releaseLock(); writer?.releaseLock(); await port?.close(); } catch { /* já fechada */ }
  port = writer = reader = null;
  waiters = [];
  awake(false);
  emit();
}

function readLine(timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const w = (l: string) => { clearTimeout(t); resolve(l); };
    const t = setTimeout(() => { waiters = waiters.filter((x) => x !== w); resolve(""); }, timeoutMs);
    waiters.push(w);
  });
}

let queue = Promise.resolve<unknown>(null);
export function sendSerial(cmd: Cmd): Promise<string> {
  const op = { digital_write: "W", pwm: "P", digital_read: "R", analog_read: "A" }[cmd.action];
  const run = async () => {
    if (!writer) throw new Error("Arduino não conectado por USB");
    buffer = "";
    await writer.write(new TextEncoder().encode(`${op} ${cmd.pin} ${cmd.value ?? 0}\n`));
    if (cmd.action === "digital_write") void import("./device").then((d) => d.setRoomState(cmd.pin, !!cmd.value));
    return readLine(3000);
  };
  const p = queue.then(run, run);
  queue = p.catch(() => null);
  return p;
}
