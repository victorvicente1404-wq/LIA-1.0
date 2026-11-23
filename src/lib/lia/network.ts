/**
 * Estado de conectividade da Lia.
 *
 * A rede é uma capacidade opcional: o núcleo local não deve depender deste
 * módulo para iniciar, carregar memória ou conversar com o motor local.
 * No Android, prefere o plugin Capacitor Network; na web, usa navigator.onLine.
 */

export type LiaConnectionType = "wifi" | "cellular" | "none" | "unknown";

export interface LiaNetworkStatus {
  connected: boolean;
  connectionType: LiaConnectionType;
  checkedAt: number;
  source: "capacitor" | "browser";
}

export type LiaNetworkListener = (status: LiaNetworkStatus) => void;

const browserStatus = (): LiaNetworkStatus => ({
  connected: typeof navigator === "undefined" ? false : navigator.onLine,
  connectionType: typeof navigator === "undefined" || navigator.onLine ? "unknown" : "none",
  checkedAt: Date.now(),
  source: "browser",
});

function normalizeType(value: unknown): LiaConnectionType {
  if (value === "wifi" || value === "cellular" || value === "none") return value;
  return "unknown";
}

/** Retorna o estado atual sem exigir conexão com a internet. */
export async function getLiaNetworkStatus(): Promise<LiaNetworkStatus> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Network")) {
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      return {
        connected: status.connected,
        connectionType: normalizeType(status.connectionType),
        checkedAt: Date.now(),
        source: "capacitor",
      };
    }
  } catch {
    // O plugin pode não estar disponível durante preview, SSR ou web.
  }
  return browserStatus();
}

/**
 * Observa mudanças de rede. Retorna uma função de limpeza para o useEffect
 * do React ou outro consumidor. A primeira leitura é emitida imediatamente.
 */
export function watchLiaNetwork(listener: LiaNetworkListener): () => void {
  let active = true;
  let nativeHandle: { remove: () => Promise<void> } | null = null;

  const emit = (status: LiaNetworkStatus) => {
    if (active) listener(status);
  };

  const onBrowserChange = () => emit(browserStatus());
  if (typeof window !== "undefined") {
    window.addEventListener("online", onBrowserChange);
    window.addEventListener("offline", onBrowserChange);
  }

  void getLiaNetworkStatus().then(emit);

  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!active || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Network")) return;
      const { Network } = await import("@capacitor/network");
      nativeHandle = await Network.addListener("networkStatusChange", (status) => {
        emit({
          connected: status.connected,
          connectionType: normalizeType(status.connectionType),
          checkedAt: Date.now(),
          source: "capacitor",
        });
      });
      const current = await Network.getStatus();
      emit({
        connected: current.connected,
        connectionType: normalizeType(current.connectionType),
        checkedAt: Date.now(),
        source: "capacitor",
      });
    } catch {
      // O listener do navegador continua sendo o fallback.
    }
  })();

  return () => {
    active = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onBrowserChange);
      window.removeEventListener("offline", onBrowserChange);
    }
    if (nativeHandle) void nativeHandle.remove();
  };
}
