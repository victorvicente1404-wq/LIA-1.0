// Service worker da Lia: apenas notificações push (sem cache de páginas).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Lia", body: "Você tem uma novidade.", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/badge.png",
      vibrate: [100, 50, 100],
      tag: data.tag,
      data: { url: data.url || "/" },
      actions: [
        { action: "open", title: "Abrir conversa" },
        { action: "dismiss", title: "Dispensar" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
