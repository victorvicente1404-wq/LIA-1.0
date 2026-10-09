/**
 * Monta os endereços de retorno para o app nativo a partir do retorno do login.
 * Os tokens vêm no "#" (fluxo implícito) ou "?code=" (PKCE). Tudo é movido para
 * a query, porque o formato intent:// do Android usa o "#" para outra coisa.
 */
export function buildNativeReturn(search: string, hash: string) {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  new URLSearchParams(hash.replace(/^#/, "")).forEach((v, k) => params.set(k, v));
  const qs = params.toString();
  const query = qs ? `?${qs}` : "";
  return {
    scheme: `liaapp://auth${query}`,
    // Chrome no Android abre apps de forma mais confiável por intent://.
    intent: `intent://auth${query}#Intent;scheme=liaapp;end`,
  };
}
