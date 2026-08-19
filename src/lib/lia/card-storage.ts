/**
 * Lia Card — camada de armazenamento portátil.
 *
 * O computador fornece o corpo e o processamento.
 * O Lia Card fornece identidade, memória e personalização.
 *
 * No protótipo o "cartão" é simulado por um volume isolado no navegador
 * (localStorage namespaced). A API abaixo é a única superfície usada pela
 * aplicação, então trocá-la por um dispositivo real (USB / File System Access
 * API / Electron) exige mudar apenas este arquivo.
 */
import { createCardData } from "./defaults";
import type { LiaCardData } from "./types";

const VOLUME_KEY = "lia.card.volume";
const MOUNT_KEY = "lia.card.mounted";

const isBrowser = () => typeof window !== "undefined";

export function cardExists(): boolean {
  return isBrowser() && window.localStorage.getItem(VOLUME_KEY) !== null;
}

export function isMounted(): boolean {
  return isBrowser() && window.localStorage.getItem(MOUNT_KEY) === "1";
}

export function readCard(): LiaCardData | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LiaCardData;
  } catch {
    return null;
  }
}

export function writeCard(data: LiaCardData): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(VOLUME_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }));
}

/** Cria (formata) um novo Lia Card. */
export function formatCard(cardName?: string): LiaCardData {
  const data = createCardData(cardName);
  writeCard(data);
  mount();
  return data;
}

export function mount(): void {
  if (isBrowser()) window.localStorage.setItem(MOUNT_KEY, "1");
}

/** Remoção segura: a aplicação continua funcionando, sem os dados portáteis. */
export function eject(): void {
  if (isBrowser()) window.localStorage.setItem(MOUNT_KEY, "0");
}

export function destroyCard(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(VOLUME_KEY);
  window.localStorage.removeItem(MOUNT_KEY);
}

export function exportCard(): string {
  return JSON.stringify(readCard(), null, 2);
}

export function importCard(json: string): LiaCardData {
  const data = JSON.parse(json) as LiaCardData;
  writeCard(data);
  mount();
  return data;
}
