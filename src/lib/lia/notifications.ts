/** Notificações do navegador (PC e celular) para mensagens e lembretes da Lia. */
const KEY = "lia.notificacoes";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsEnabled() {
  if (!notificationsSupported()) return false;
  return window.localStorage.getItem(KEY) === "on" && Notification.permission === "granted";
}

export async function setNotificationsEnabled(on: boolean) {
  if (!notificationsSupported()) return false;
  if (!on) {
    window.localStorage.setItem(KEY, "off");
    return false;
  }
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  const ok = permission === "granted";
  window.localStorage.setItem(KEY, ok ? "on" : "off");
  return ok;
}

function canUseSw() {
  if (!("serviceWorker" in navigator) || window.self !== window.top) return false;
  const h = window.location.hostname;
  return !h.includes("id-preview--") && !h.includes("lovableproject.com") && h !== "localhost";
}

export async function notify(title: string, body: string) {
  if (!notificationsEnabled()) return;
  const opts = { body, icon: "/icon-192.png", badge: "/badge.png", tag: "lia", data: { url: "/" } };
  // Celulares Android não aceitam `new Notification`: usar o service worker.
  if (canUseSw()) {
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
      return;
    } catch {
      /* cai para o modo simples */
    }
  }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* navegador sem suporte */
  }
}
