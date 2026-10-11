/** Hub de telemetria: envia estado do aparelho (30s ou em mudanças) e notificações do Android. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { deviceKind, deviceName } from "./sync/link";

const KEY = "lia.telemetry.device";
export function deviceKey(): string {
  let k = localStorage.getItem(KEY);
  if (!k) { k = crypto.randomUUID(); localStorage.setItem(KEY, k); }
  return k;
}

async function cap() {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    return Capacitor.isNativePlatform() ? { Capacitor, native: Capacitor.isPluginAvailable("LiaNative") ? registerPlugin<any>("LiaNative") : null } : null;
  } catch { return null; }
}

const timeout = <T,>(p: Promise<T>, ms = 4000) => Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

export async function collect() {
  const c = await cap();
  const t: Record<string, any> = { name: deviceName(), kind: deviceKind(), screen_on: document.visibilityState === "visible", foreground_app: document.visibilityState === "visible" ? "Lia" : null };
  try {
    if (c) {
      const { Device } = await import("@capacitor/device");
      const [b, info] = await Promise.all([Device.getBatteryInfo(), Device.getInfo()]);
      t.battery = b.batteryLevel != null ? Math.round(b.batteryLevel * 100) : null; t.charging = b.isCharging ?? null;
      t.model = `${info.manufacturer} ${info.model} (${info.operatingSystem} ${info.osVersion})`;
    } else {
      const b = await (navigator as any).getBattery?.();
      if (b) { t.battery = Math.round(b.level * 100); t.charging = b.charging; }
      t.model = navigator.userAgent.slice(0, 120);
    }
  } catch { /* sem bateria */ }
  try {
    if (c) {
      const { Network } = await import("@capacitor/network");
      const s = await Network.getStatus();
      t.network = s.connected ? s.connectionType : "offline";
    }
    if (!t.network || t.network === "cellular" || t.network === "unknown") {
      const nc = (navigator as any).connection;
      const eff = nc?.effectiveType;
      t.network = !navigator.onLine ? "offline" : t.network === "cellular" ? `celular ${eff ?? ""}`.trim() : nc?.type && nc.type !== "unknown" ? nc.type : eff ?? t.network ?? "online";
    }
  } catch { /* */ }
  try {
    const pos: any = c
      ? await timeout((await import("@capacitor/geolocation")).Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }), 9000)
      : await timeout(new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 120_000 })), 9000);
    t.latitude = pos.coords.latitude; t.longitude = pos.coords.longitude; t.altitude = pos.coords.altitude ?? null; t.accuracy = pos.coords.accuracy;
  } catch { /* sem permissão */ }
  try {
    if (c?.native) {
      const s = await timeout(c.native.deviceState(), 2000) as any;
      t.screen_on = !!s.screenOn; if (s.app) t.foreground_app = s.app;
    }
  } catch { /* plugin antigo */ }
  return t;
}

let last = "";
async function pushTelemetry(force = false) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const t = await collect();
  const sig = JSON.stringify({ ...t, latitude: t.latitude?.toFixed?.(3), longitude: t.longitude?.toFixed?.(3), accuracy: undefined, altitude: undefined });
  if (!force && sig === last) return;
  last = sig;
  await supabase.from("lia_device_telemetry").upsert({ ...t, user_id: session.user.id, device_key: deviceKey(), updated_at: new Date().toISOString() }, { onConflict: "user_id,device_key" });
}

async function pushNotifications() {
  const c = await cap();
  if (!c?.native) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  try {
    const r = await timeout(c.native.readNotifications(), 2000) as any;
    const items = (r?.items ?? []) as { app: string; title: string; body: string; time: number }[];
    if (!items.length) return;
    await supabase.from("lia_notifications").insert(items.map((n) => ({
      user_id: session.user.id, device_key: deviceKey(), app: String(n.app ?? "").slice(0, 80),
      title: String(n.title ?? "").slice(0, 200), body: String(n.body ?? "").slice(0, 1000),
      posted_at: new Date(Number(n.time) || Date.now()).toISOString(),
    })));
  } catch { /* permissão de notificações ainda não dada */ }
}

/** Inicia o hub. Devolve função para parar. */
export function startTelemetry(): () => void {
  let pulse = 0;
  const tick = () => { pulse++; void pushTelemetry(pulse % 10 === 0).catch(() => undefined); };
  tick();
  const t1 = setInterval(tick, 30_000);
  const t2 = setInterval(() => void pushNotifications(), 5_000);
  const onChange = () => void pushTelemetry(true).catch(() => undefined);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  let removers: (() => void)[] = [];
  void cap().then(async (c) => {
    if (!c) return;
    const { Network } = await import("@capacitor/network");
    const h = await Network.addListener("networkStatusChange", onChange);
    removers.push(() => void h.remove());
  });
  return () => {
    clearInterval(t1); clearInterval(t2);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
    removers.forEach((r) => r()); removers = [];
  };
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`;
};

/** Texto consolidado para o system prompt: todos os aparelhos + últimas notificações. */
export async function telemetryContext(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return "";
  const [{ data: devs }, { data: notes }] = await Promise.all([
    supabase.from("lia_device_telemetry").select("*").order("updated_at", { ascending: false }).limit(8),
    supabase.from("lia_notifications").select("app,title,body,posted_at").order("posted_at", { ascending: false }).limit(15),
  ]);
  const me = deviceKey();
  const lines: string[] = [];
  for (const d of devs ?? []) {
    const parts = [
      d.battery != null ? `bateria ${d.battery}%${d.charging ? " carregando" : ""}` : null,
      d.network ? `rede ${d.network}` : null,
      d.latitude != null ? `local ${d.latitude.toFixed(4)}, ${d.longitude?.toFixed(4)}${d.altitude != null ? `, alt ${Math.round(d.altitude)} m` : ""} (±${Math.round(d.accuracy ?? 0)} m)` : null,
      d.screen_on != null ? `tela ${d.screen_on ? "ligada" : "desligada"}` : null,
      d.foreground_app ? `app aberto: ${d.foreground_app}` : null,
      d.model ? `modelo ${d.model}` : null,
    ].filter(Boolean).join(", ");
    lines.push(`- ${d.kind === "mobile" ? "Celular" : "PC"} "${d.name}"${d.device_key === me ? " (este aparelho)" : ""}, atualizado ${ago(d.updated_at)}: ${parts || "sem dados"}`);
  }
  const n = (notes ?? []).map((x) => `- [${ago(x.posted_at)}] ${x.app}: ${x.title}${x.body ? ` — ${x.body.slice(0, 160)}` : ""}`);
  return [
    lines.length ? `APARELHOS CONECTADOS\n${lines.join("\n")}` : "",
    n.length ? `ÚLTIMAS NOTIFICAÇÕES DO CELULAR (use quando relevante; nunca invente)\n${n.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}
