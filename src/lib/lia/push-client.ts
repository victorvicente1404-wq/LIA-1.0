import { VAPID_PUBLIC_KEY } from "./push-config";
import { removePushSubscription, savePushSubscription } from "./push.functions";

export type PushStatus = "unsupported" | "default" | "granted" | "denied";

export function isPreviewOrIframe() {
  if (typeof window === "undefined") return true;
  const inIframe = window.self !== window.top;
  const h = window.location.hostname;
  return inIframe || h.includes("id-preview--") || h.includes("lovableproject.com") || h === "localhost";
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext &&
    !isPreviewOrIframe()
  );
}

export function pushStatus(): PushStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushStatus;
}

function keyBytes(b64: string) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registration() {
  if (new URLSearchParams(window.location.search).get("sw") === "off") {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    return null;
  }
  return navigator.serviceWorker.register("/sw.js");
}

/** Inscreve (ou renova) o navegador e salva no servidor. */
export async function subscribePush() {
  if (!pushSupported()) return false;
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return false;
  const reg = await registration();
  if (!reg) return false;
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const current = new Uint8Array(sub.options.applicationServerKey ?? new ArrayBuffer(0));
    const wanted = keyBytes(VAPID_PUBLIC_KEY);
    if (current.length && current.join() !== wanted.join()) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  await savePushSubscription({
    data: { endpoint: sub.endpoint, p256dh: json.keys!["p256dh"]!, auth: json.keys!["auth"]!, userAgent: navigator.userAgent.slice(0, 300) },
  });
  return true;
}

export async function unsubscribePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await removePushSubscription({ data: { endpoint: sub.endpoint } });
  } catch {
    /* sem login */
  }
  await sub.unsubscribe();
}

export async function hasPushSubscription() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}
