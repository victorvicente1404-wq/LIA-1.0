/** Sensores e ações do próprio aparelho (somente navegador/WebView). Nada roda no carregamento. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const ROOMS: { pin: number; nome: string }[] = [
  { pin: 2, nome: "Sala" },
  { pin: 3, nome: "Cozinha" },
  { pin: 4, nome: "Quarto de Solteiro" },
  { pin: 5, nome: "Suíte Master" },
  { pin: 6, nome: "Banheiro" },
];

const roomState = new Map<number, boolean>();
export const setRoomState = (pin: number, on: boolean) => roomState.set(pin, on);

let geo: { lat: number; lon: number; acc: number; t: number } | null = null;
let geoAsked = false;
function refreshGeo() {
  if (geoAsked || !("geolocation" in navigator)) return;
  geoAsked = true;
  const ok = (p: GeolocationPosition) => {
    geo = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    geoAsked = false;
  };
  navigator.geolocation.getCurrentPosition(ok, () => {
    // fallback: baixa precisão
    navigator.geolocation.getCurrentPosition(ok, () => { geoAsked = false; }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 });
  }, { enableHighAccuracy: true, timeout: 6000, maximumAge: 120_000 });
}

/** Resumo silencioso de contexto enviado junto com cada mensagem (não aparece no chat). */
export async function contextSnapshot(): Promise<string> {
  const lines: string[] = [];
  try {
    const b = await (navigator as any).getBattery?.();
    if (b) lines.push(`Bateria: ${Math.round(b.level * 100)}%${b.charging ? " (carregando)" : ""}`);
  } catch { /* sem API */ }
  const c = (navigator as any).connection;
  if (c) lines.push(`Rede: ${c.type && c.type !== "unknown" ? c.type : c.effectiveType ?? "desconhecida"}${c.saveData ? ", economia de dados ligada" : ""}`);
  if (!navigator.onLine) lines.push("Rede: offline");
  refreshGeo();
  if (geo && Date.now() - geo.t < 30 * 60_000) lines.push(`Localização aproximada: ${geo.lat.toFixed(3)}, ${geo.lon.toFixed(3)} (±${Math.round(geo.acc)} m)`);
  lines.push(`Tela: ${document.visibilityState === "visible" ? "Lia aberta em primeiro plano" : "em segundo plano"}`);
  if (roomState.size) lines.push(`Maquete: ${ROOMS.filter((r) => roomState.has(r.pin)).map((r) => `${r.nome} ${roomState.get(r.pin) ? "acesa" : "apagada"}`).join(", ")}`);
  return lines.join("\n");
}

export function vibrate(pattern: number | number[] = [60, 40, 60]) {
  return !!navigator.vibrate?.(pattern);
}

let torchStream: MediaStream | null = null;
export async function setTorch(on: boolean) {
  if (!on) {
    torchStream?.getTracks().forEach((t) => t.stop());
    torchStream = null;
    return;
  }
  if (!torchStream) torchStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
  const track = torchStream.getVideoTracks()[0];
  const caps = (track?.getCapabilities?.() ?? {}) as any;
  if (!caps.torch) {
    torchStream.getTracks().forEach((t) => t.stop());
    torchStream = null;
    throw new Error("Este aparelho não permite controlar a lanterna pelo navegador");
  }
  await track!.applyConstraints({ advanced: [{ torch: true } as any] });
}

let wakeLock: any = null;
export async function keepAwake(on: boolean) {
  try {
    if (on && !wakeLock) {
      wakeLock = await (navigator as any).wakeLock?.request("screen");
      wakeLock?.addEventListener?.("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* navegador sem suporte ou aba oculta */ }
}
