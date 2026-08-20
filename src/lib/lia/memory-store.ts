/**
 * Armazenamento das memórias da Lia em um local escolhido pelo usuário.
 *
 * Camada substituível: hoje usa a File System Access API (pasta real do
 * sistema, escolhida pelo seletor nativo). O handle da pasta é guardado no
 * IndexedDB para sobreviver a recarregamentos.
 */
import type { LiaCardData } from "./types";

const DB = "lia-memoria";
const STORE = "handles";
const KEY = "pasta";
export const MEMORY_FILE = "lia-memoria.json";

export const supportsFolderPicker = () =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value: unknown) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => res(null);
    tx.onerror = () => rej(tx.error);
  });
}

async function idbGet<T>(): Promise<T | null> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => res((req.result as T) ?? null);
    req.onerror = () => rej(req.error);
  });
}

type DirHandle = any;

let cached: DirHandle | null = null;

export async function getFolder(): Promise<DirHandle | null> {
  if (cached) return cached;
  if (typeof indexedDB === "undefined") return null;
  cached = await idbGet<DirHandle>().catch(() => null);
  return cached;
}

/** Verifica (e pede, se preciso) permissão de escrita na pasta salva. */
export async function ensurePermission(prompt = false): Promise<boolean> {
  const handle = await getFolder();
  if (!handle) return false;
  const opts = { mode: "readwrite" as const };
  const state = await handle.queryPermission?.(opts);
  if (state === "granted") return true;
  if (!prompt) return false;
  return (await handle.requestPermission?.(opts)) === "granted";
}

/** Abre o seletor nativo de pastas do sistema. */
export async function chooseFolder(): Promise<{ name: string } | null> {
  if (!supportsFolderPicker()) throw new Error("no-picker");
  const handle = await (window as any).showDirectoryPicker({
    id: "lia-memoria",
    mode: "readwrite",
  });
  cached = handle;
  await idbSet(handle);
  return { name: handle.name as string };
}

export async function forgetFolder(): Promise<void> {
  cached = null;
  await idbSet(null).catch(() => undefined);
}

/** Grava as memórias no local escolhido. Não apaga nada em outro local. */
export async function writeMemories(data: LiaCardData): Promise<void> {
  const handle = await getFolder();
  if (!handle) throw new Error("sem-pasta");
  if (!(await ensurePermission(false))) throw new Error("sem-permissao");
  const file = await handle.getFileHandle(MEMORY_FILE, { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify({ ...data, updatedAt: Date.now() }, null, 2));
  await writable.close();
}

export async function readMemories(): Promise<LiaCardData | null> {
  const handle = await getFolder();
  if (!handle) return null;
  if (!(await ensurePermission(false))) throw new Error("sem-permissao");
  try {
    const file = await handle.getFileHandle(MEMORY_FILE);
    const text = await (await file.getFile()).text();
    return JSON.parse(text) as LiaCardData;
  } catch {
    return null;
  }
}

/** Fallback para navegadores sem File System Access API: baixa o arquivo. */
export function downloadMemories(data: LiaCardData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = MEMORY_FILE;
  a.click();
  URL.revokeObjectURL(url);
}
