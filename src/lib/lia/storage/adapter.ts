/**
 * Contrato assíncrono para persistência local da Lia.
 *
 * As chaves são mantidas explícitas para permitir ler os dados legados sem
 * renomear nem apagar entradas existentes durante a migração.
 */
export interface LiaKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Adaptador Web compatível com as chaves atuais do localStorage.
 *
 * Recebe Storage por parâmetro para não acessar window durante SSR/testes.
 * Erros de quota e I/O são propagados ao chamador: salvar não deve parecer
 * bem-sucedido quando o navegador recusou a gravação.
 */
export function createWebStorageAdapter(storage: Storage): LiaKeyValueStore {
  return {
    async get(key) {
      return storage.getItem(key);
    },
    async set(key, value) {
      storage.setItem(key, value);
    },
    async remove(key) {
      storage.removeItem(key);
    },
  };
}

/** Retorna o adaptador Web quando executado em um navegador. */
export function getWebStorageAdapter(): LiaKeyValueStore | null {
  if (typeof window === "undefined") return null;
  return createWebStorageAdapter(window.localStorage);
}
