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

export function notify(title: string, body: string) {
  if (!notificationsEnabled()) return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.png", tag: "lia" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* alguns navegadores exigem service worker; nesse caso a notificação é ignorada */
  }
}
