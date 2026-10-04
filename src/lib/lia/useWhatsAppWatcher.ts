import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { notify } from "./notifications";
import { getChats, isConfigured, onWhatsAppConfigChange, readWhatsAppConfig } from "./whatsappService";

/** Polling a cada 10s: alerta quando chega mensagem nova (importante) no WhatsApp. */
export function useWhatsAppWatcher(intervalMs = 10_000) {
  const seen = useRef<Map<string, number>>(new Map());
  const primed = useRef(false);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;

    async function tick() {
      const cfg = readWhatsAppConfig();
      if (!cfg.watch || !isConfigured(cfg)) return;
      try {
        const chats = await getChats(cfg);
        const words = cfg.keywords
          .split(",")
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean);
        for (const c of chats) {
          const prev = seen.current.get(c.id) ?? 0;
          const at = c.lastAt ?? 0;
          seen.current.set(c.id, Math.max(prev, at));
          if (!primed.current || at <= prev || c.unread <= 0) continue;
          const text = c.lastMessage ?? "";
          const important =
            !words.length || words.some((w) => text.toLowerCase().includes(w) || c.name.toLowerCase().includes(w));
          if (!important) continue;
          const title = `WhatsApp — ${c.name}`;
          toast(title, { description: text.slice(0, 160) || "Nova mensagem" });
          notify(title, text.slice(0, 180) || "Nova mensagem");
        }
        primed.current = true;
      } catch (err) {
        console.warn("WhatsApp watcher:", (err as Error).message);
      }
    }

    function start() {
      if (timer) window.clearInterval(timer);
      primed.current = false;
      seen.current.clear();
      if (stopped) return;
      void tick();
      timer = window.setInterval(tick, intervalMs);
    }

    start();
    const off = onWhatsAppConfigChange(start);
    return () => {
      stopped = true;
      off();
      if (timer) window.clearInterval(timer);
    };
  }, [intervalMs]);
}
