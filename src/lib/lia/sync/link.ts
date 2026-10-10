/**
 * Lia Link — sincronização local-first entre dispositivos.
 *
 * Os dados continuam no Lia Card e no navegador. Este módulo apenas lê e
 * grava esses mesmos lugares e espelha cada item, cifrado com a senha de
 * sincronização (PBKDF2 → AES-GCM), na nuvem. O servidor nunca vê o conteúdo.
 */
import { supabase } from "@/integrations/supabase/client";
import * as card from "../card-storage";
import * as convo from "../conversations";
import type { Conversation } from "../conversations";
import type { ChatMessage, CustomApi, LiaCardData, MemoryItem } from "../types";

// ---------- estado público ----------
export type LinkStatus = "local" | "syncing" | "active";
export interface LinkDevice { id: string; name: string; kind: string; last_seen: string }
/** live = tempo real conectado; false com status "active" = modo de busca periódica (plano B). */
export interface LinkSnapshot { status: LinkStatus; devices: LinkDevice[]; deviceId: string | null; error: string | null; live: boolean }

let snap: LinkSnapshot = { status: "local", devices: [], deviceId: null, error: null, live: false };
const listeners = new Set<() => void>();
const setSnap = (p: Partial<LinkSnapshot>) => {
  snap = { ...snap, ...p };
  listeners.forEach((l) => l());
};
export const linkStore = {
  get: () => snap,
  subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
};
export const APPLIED_EVENT = "lia-link-applied";

// ---------- identidade do dispositivo ----------
const STATE_KEY = "lia.link";
const KNOWN_KEY = "lia.link.known";
interface LocalState { spaceId: string; deviceId: string }

export const deviceKind = (): "mobile" | "desktop" =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "mobile" : "desktop";

export function deviceName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "dispositivo";
  return `${browser} no ${os}`;
}

const readState = (): LocalState | null => {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? "null"); } catch { return null; }
};
type Known = Record<string, { h: string; t: number }>;
const readKnown = (): Known => {
  try { return JSON.parse(localStorage.getItem(KNOWN_KEY) ?? "{}"); } catch { return {}; }
};
const writeKnown = (k: Known) => localStorage.setItem(KNOWN_KEY, JSON.stringify(k));

// ---------- criptografia ----------
const b64 = (u: Uint8Array) => {
  let out = "";
  for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
  return btoa(out);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: unb64(salt), iterations: 310_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function enc(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}
async function dec<T>(key: CryptoKey, payload: string): Promise<T> {
  const [iv, ct] = payload.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, key, unb64(ct!));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

// Chave não exportável guardada no IndexedDB.
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("lia-link", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveKey(k: CryptoKey | null) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction("keys", "readwrite");
    if (k) tx.objectStore("keys").put(k, "main"); else tx.objectStore("keys").delete("main");
    tx.oncomplete = () => res(null);
    tx.onerror = () => rej(tx.error);
  });
}
async function loadKey(): Promise<CryptoKey | null> {
  const db = await idb();
  return new Promise((res) => {
    const r = db.transaction("keys").objectStore("keys").get("main");
    r.onsuccess = () => res((r.result as CryptoKey) ?? null);
    r.onerror = () => res(null);
  });
}

// ---------- itens sincronizados ----------
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const CARD_PREFIXES = ["core", "mem:", "api:", "face:"];
const isCardKey = (k: string) => CARD_PREFIXES.some((p) => k === p || k.startsWith(p));
const LS_KEYS: Record<string, string> = { "ls:whatsapp": "lia.whatsapp", "ls:theme": "lia.theme", "ls:iot": "lia.iot" };

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const c = card.isMounted() ? card.readCard() : null;
  if (c) {
    const { history: _h, customApis, faces, updatedAt: _u, ...rest } = c;
    out["core"] = { ...rest, profiles: c.profiles.map(({ memory: _m, ...p }) => p) };
    for (const p of c.profiles) for (const m of p.memory ?? []) out[`mem:${p.id}:${m.id}`] = m;
    for (const a of customApis ?? []) out[`api:${a.name}`] = a;
    for (const f of faces ?? []) out[`face:${f.nome}`] = f;
  }
  for (const conv of convo.readConversations()) if (conv.messages.length) out[`conv:${conv.id}`] = conv;
  for (const [k, ls] of Object.entries(LS_KEYS)) {
    const v = localStorage.getItem(ls);
    if (v) out[k] = v;
  }
  return out;
}

const mergeMessages = (a: ChatMessage[], b: ChatMessage[]) => {
  const map = new Map<string, ChatMessage>();
  for (const m of [...a, ...b]) map.set(m.id, m);
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt).slice(-200);
};

/** Aplica um item remoto no armazenamento local. null = removido. */
function applyItem(key: string, value: unknown | null) {
  if (key.startsWith("conv:")) {
    const id = key.slice(5);
    const list = convo.readConversations();
    const cur = list.find((c) => c.id === id);
    if (!value) {
      convo.writeConversations(list.filter((c) => c.id !== id));
      return;
    }
    const inc = value as Conversation;
    const merged: Conversation = cur
      ? { ...cur, ...inc, messages: mergeMessages(cur.messages, inc.messages), updatedAt: Math.max(cur.updatedAt, inc.updatedAt) }
      : inc;
    convo.writeConversations([merged, ...list.filter((c) => c.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt));
    return;
  }
  if (key in LS_KEYS) {
    if (value) localStorage.setItem(LS_KEYS[key]!, value as string);
    return;
  }
  if (!isCardKey(key)) return;
  let c = card.readCard();
  if (key === "core") {
    if (!value) return;
    const core = value as Omit<LiaCardData, "history"> & { profiles: Omit<LiaCardData["profiles"][number], "memory">[] };
    if (!c) {
      card.writeCard({ ...(core as LiaCardData), history: [], profiles: core.profiles.map((p) => ({ ...p, memory: [] })) } as LiaCardData);
      card.mount();
      return;
    }
    card.writeCard({
      ...c,
      ...core,
      profiles: core.profiles.map((p) => ({ ...p, memory: c!.profiles.find((x) => x.id === p.id)?.memory ?? [] })),
      // Perfis que só existem aqui continuam (com suas memórias).
    } as LiaCardData);
    return;
  }
  if (!c) return;
  if (key.startsWith("mem:")) {
    const [, pid, mid] = key.split(":");
    c = {
      ...c,
      profiles: c.profiles.map((p) => {
        if (p.id !== pid) return p;
        const rest = p.memory.filter((m) => m.id !== mid);
        return { ...p, memory: value ? [value as MemoryItem, ...rest].sort((a, b) => b.createdAt - a.createdAt) : rest };
      }),
    };
  } else if (key.startsWith("api:")) {
    const name = key.slice(4);
    const rest = (c.customApis ?? []).filter((a) => a.name !== name);
    c = { ...c, customApis: value ? [...rest, value as CustomApi] : rest };
  } else if (key.startsWith("face:")) {
    const nome = key.slice(5);
    const rest = (c.faces ?? []).filter((f) => f.nome !== nome);
    c = { ...c, faces: value ? [...rest, value as { nome: string; descriptor: number[] }] : rest };
  }
  card.writeCard(c);
}

// ---------- motor ----------
let key: CryptoKey | null = null;
let state: LocalState | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let beat: ReturnType<typeof setInterval> | null = null;
let busy = false;
let commandHandler: ((cmd: RemoteCommand) => Promise<void>) | null = null;

export interface RemoteCommand {
  acao: "notificar" | "abrir_link" | "usb";
  texto?: string | undefined;
  url?: string | undefined;
  usb?: { action: "digital_write" | "pwm" | "digital_read" | "analog_read"; pin: number; value?: number | undefined } | undefined;
  conversationId?: string | undefined;
}
export const onRemoteCommand = (h: (cmd: RemoteCommand) => Promise<void>) => { commandHandler = h; };

async function processRow(row: { item_key: string; ciphertext: string; updated_at: number; deleted: boolean; device_id: string | null }) {
  if (!key || row.device_id === state?.deviceId) return false;
  const known = readKnown();
  const k = known[row.item_key];
  if (k && k.t >= Number(row.updated_at)) return false;
  const value = row.deleted ? null : await dec<unknown>(key, row.ciphertext);
  applyItem(row.item_key, value);
  known[row.item_key] = { h: row.deleted ? "x" : hash(JSON.stringify(value)), t: Number(row.updated_at) };
  writeKnown(known);
  return true;
}

/** Envia o que mudou localmente desde a última sincronização. */
async function pushChanges() {
  if (!key || !state || busy) return;
  busy = true;
  try {
    const now = snapshot();
    const known = readKnown();
    const mounted = card.isMounted();
    const rows: { space_id: string; item_key: string; ciphertext: string; updated_at: number; deleted: boolean; device_id: string }[] = [];
    const t = Date.now();
    for (const [k, v] of Object.entries(now)) {
      const h = hash(JSON.stringify(v));
      if (known[k]?.h === h) continue;
      rows.push({ space_id: state.spaceId, item_key: k, ciphertext: await enc(key, v), updated_at: t, deleted: false, device_id: state.deviceId });
      known[k] = { h, t };
    }
    for (const k of Object.keys(known)) {
      if (k in now || known[k]!.h === "x") continue;
      if (isCardKey(k) && !mounted) continue; // cartão ejetado não apaga nada
      if (k === "core" || k in LS_KEYS) continue;
      rows.push({ space_id: state.spaceId, item_key: k, ciphertext: "", updated_at: t, deleted: true, device_id: state.deviceId });
      known[k] = { h: "x", t };
    }
    if (rows.length) {
      setSnap({ status: "syncing" });
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from("sync_blobs").upsert(rows.slice(i, i + 50), { onConflict: "space_id,item_key" });
        if (error) throw error;
      }
      writeKnown(known);
    }
    setSnap({ status: "active", error: null });
  } catch (e) {
    setSnap({ status: "active", error: (e as Error).message });
  } finally {
    busy = false;
  }
}

/**
 * Puxa da nuvem só o que mudou: primeiro um índice leve (sem conteúdo cifrado),
 * depois o conteúdo apenas dos itens mais novos que a cópia local.
 */
async function pullAll() {
  if (!state) return;
  const sid = state.spaceId;
  const { data: index, error } = await supabase.from("sync_blobs").select("item_key, updated_at, device_id").eq("space_id", sid);
  if (error) throw error;
  const known = readKnown();
  const stale = (index ?? [])
    .filter((r) => r.device_id !== state?.deviceId && !(known[r.item_key] && known[r.item_key]!.t >= Number(r.updated_at)))
    .map((r) => r.item_key);
  if (!stale.length) return;
  const rows: Parameters<typeof processRow>[0][] = [];
  for (let i = 0; i < stale.length; i += 100) {
    const { data, error: e2 } = await supabase
      .from("sync_blobs")
      .select("item_key, ciphertext, updated_at, deleted, device_id")
      .eq("space_id", sid)
      .in("item_key", stale.slice(i, i + 100));
    if (e2) throw e2;
    rows.push(...(data ?? []));
  }
  let changed = false;
  const rank = (k: string) => (k === "core" ? 0 : 1);
  rows.sort((a, b) => rank(a.item_key) - rank(b.item_key));
  for (const row of rows) {
    try { if (await processRow(row)) changed = true; } catch { /* item de outra senha: ignora */ }
  }
  if (changed) window.dispatchEvent(new Event(APPLIED_EVENT));
}

type CommandRow = { id: string; target: string; from_device: string | null; payload: string; status: string };
async function handleCommandRow(row: CommandRow) {
  if (!key || row.status !== "pending" || row.from_device === state?.deviceId || row.target !== deviceKind()) return;
  const { data } = await supabase.from("sync_commands").update({ status: "running" }).eq("id", row.id).eq("status", "pending").select("id");
  if (!data?.length) return; // outro aparelho já pegou
  try {
    await commandHandler?.(await dec<RemoteCommand>(key, row.payload));
    await supabase.from("sync_commands").update({ status: "done" }).eq("id", row.id);
  } catch {
    await supabase.from("sync_commands").update({ status: "failed" }).eq("id", row.id);
  }
}

/** Comandos que chegaram enquanto o tempo real estava fora do ar. */
async function pollCommands() {
  if (!state || !key) return;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await supabase
    .from("sync_commands")
    .select("id, target, from_device, payload, status")
    .eq("space_id", state.spaceId)
    .eq("status", "pending")
    .eq("target", deviceKind())
    .gte("created_at", since)
    .order("created_at");
  for (const row of data ?? []) await handleCommandRow(row);
}

// ---------- tempo real, watchdog e ciclo de vida ----------
let rtStatus: string = "CLOSED";
let channelGen = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let watchdog: ReturnType<typeof setInterval> | null = null;
let hiddenAt = 0;
let lastSilent = 0;
let silentRunning = false;
let lifecycleCleanup: (() => void) | null = null;

const POLL_MS = 4500;
const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";
const realtimeHealthy = () => rtStatus === "SUBSCRIBED" && supabase.realtime.isConnected();

/** Verificação silenciosa: puxa, envia e busca comandos pendentes. */
async function silentSync(minGap = 1500) {
  if (!state || !key || silentRunning) return;
  if (Date.now() - lastSilent < minGap) return;
  silentRunning = true;
  lastSilent = Date.now();
  try {
    await pullAll();
    await pushChanges();
    await pollCommands();
  } catch {
    /* rede instável: tenta de novo no próximo ciclo */
  } finally {
    silentRunning = false;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || !state || !key) return;
  const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempts);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void subscribeChannel();
  }, delay);
}

/** Desmonta e (re)inscreve o canal do Lia Link. */
async function subscribeChannel(forceSocket = false) {
  if (!state || !key) return;
  const my = ++channelGen;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (channel) {
    const old = channel;
    channel = null;
    await supabase.removeChannel(old).catch(() => undefined);
  }
  if (my !== channelGen || !state) return;
  rtStatus = "CONNECTING";
  setSnap({ live: false });
  try {
    if (forceSocket) supabase.realtime.disconnect();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
  } catch { /* segue com o token atual */ }
  if (my !== channelGen || !state) return;
  const sid = state.spaceId;
  channel = supabase
    .channel(`lia-link-${sid}-${my}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "sync_blobs", filter: `space_id=eq.${sid}` }, async (p) => {
      const row = p.new as Parameters<typeof processRow>[0];
      if (row?.item_key && (await processRow(row).catch(() => false))) window.dispatchEvent(new Event(APPLIED_EVENT));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "sync_devices", filter: `space_id=eq.${sid}` }, () => void refreshDevices())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "sync_commands", filter: `space_id=eq.${sid}` }, (p) => {
      void handleCommandRow(p.new as CommandRow);
    })
    .subscribe((s) => {
      if (my !== channelGen) return; // canal antigo
      rtStatus = s;
      if (s === "SUBSCRIBED") {
        reconnectAttempts = 0;
        setSnap({ live: true });
        void silentSync(0); // recupera o que passou enquanto estava fora
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setSnap({ live: false });
        scheduleReconnect();
      }
    });
}

/** App voltou ao primeiro plano / ganhou foco. */
function onResume() {
  if (!state || !key) return;
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  hiddenAt = 0;
  // Ficou muito tempo suspenso: o socket pode estar "zumbi" mesmo dizendo conectado.
  if (!realtimeHealthy() || away > 30_000) {
    reconnectAttempts = 0;
    void subscribeChannel(away > 30_000 || !supabase.realtime.isConnected());
  }
  void refreshDevices();
  void silentSync(0);
}
function onHide() {
  hiddenAt = Date.now();
}

function bindLifecycle() {
  if (lifecycleCleanup || typeof window === "undefined") return;
  const onVis = () => (isVisible() ? onResume() : onHide());
  const onFocus = () => onResume();
  const onInteract = () => void silentSync(5000);
  const onOnlineEv = () => { reconnectAttempts = 0; onResume(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onFocus);
  window.addEventListener("online", onOnlineEv);
  window.addEventListener("pointerdown", onInteract, { passive: true });
  window.addEventListener("keydown", onInteract);
  let removeNative: (() => void) | null = null;
  let cancelled = false;
  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import("@capacitor/app");
      const h = await App.addListener("appStateChange", ({ isActive }) => (isActive ? onResume() : onHide()));
      if (cancelled) void h.remove();
      else removeNative = () => void h.remove();
    } catch { /* fora do app nativo */ }
  })();
  lifecycleCleanup = () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onFocus);
    window.removeEventListener("online", onOnlineEv);
    window.removeEventListener("pointerdown", onInteract);
    window.removeEventListener("keydown", onInteract);
    removeNative?.();
  };
}

async function start() {
  stopEngine();
  if (!state || !key) return;
  setSnap({ status: "syncing", deviceId: state.deviceId });
  try {
    await refreshDevices();
    if (!state) return;
    await pullAll();
    await pushChanges();
    await pollCommands();
  } catch (e) {
    setSnap({ status: "active", error: (e as Error).message });
  }
  if (!state) return;
  void subscribeChannel();
  timer = setInterval(() => void pushChanges(), 3000);
  beat = setInterval(() => {
    if (state) void supabase.from("sync_devices").update({ last_seen: new Date().toISOString() }).eq("id", state.deviceId);
  }, 60_000);
  // Plano B: sem tempo real ativo, busca leve a cada 4,5 s só com a tela visível.
  watchdog = setInterval(() => {
    if (!state || !key || !isVisible()) return;
    if (realtimeHealthy()) return;
    void silentSync(POLL_MS - 500);
    if (rtStatus !== "CONNECTING") scheduleReconnect();
  }, POLL_MS);
  bindLifecycle();
}

function stopEngine() {
  channelGen++;
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  rtStatus = "CLOSED";
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectAttempts = 0;
  if (timer) clearInterval(timer);
  if (beat) clearInterval(beat);
  if (watchdog) clearInterval(watchdog);
  timer = beat = watchdog = null;
  lifecycleCleanup?.();
  lifecycleCleanup = null;
  setSnap({ live: false });
}

/** Chamado uma vez no carregamento do app. */
export async function initLink() {
  if (typeof window === "undefined") return;
  state = readState();
  if (!state) return setSnap({ status: "local", devices: [], deviceId: null });
  key = await loadKey().catch(() => null);
  const { data } = await supabase.auth.getSession();
  if (!key || !data.session) return setSnap({ status: "local", error: !data.session ? "Entre na sua conta para sincronizar." : null });
  await start();
}

async function requireUser() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Entre na sua conta para usar o Lia Link.");
  return data.user;
}

function persistLocal(s: LocalState, k: CryptoKey) {
  state = s;
  key = k;
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
  localStorage.removeItem(KNOWN_KEY); // primeira fusão: tudo é comparado de novo
  return saveKey(k);
}

/** Dispositivo 1: cria o espaço (se preciso) e gera um código de 6 dígitos. */
export async function generatePairing(password: string): Promise<{ code: string; expiresAt: number }> {
  const user = await requireUser();
  if (!state) {
    if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const k = await deriveKey(password, salt);
    const verifier = await enc(k, "lia-link-ok");
    const spaceId = crypto.randomUUID();
    const { error } = await supabase.from("sync_spaces").insert({ id: spaceId, owner_id: user.id, salt, verifier });
    if (error) throw error;
    const deviceId = crypto.randomUUID();
    const { error: e2 } = await supabase.from("sync_devices").insert({ id: deviceId, space_id: spaceId, user_id: user.id, name: deviceName(), kind: deviceKind() });
    if (e2) throw e2;
    await persistLocal({ spaceId, deviceId }, k);
    void start();
  }
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
  const expiresAt = Date.now() + 10 * 60_000;
  const { error } = await supabase.from("sync_pairings").insert({ code, space_id: state!.spaceId, created_by: user.id, expires_at: new Date(expiresAt).toISOString() });
  if (error) throw error;
  return { code, expiresAt };
}

/** Dispositivo 2: entra com código + senha e faz a fusão inicial. */
export async function joinWithCode(code: string, password: string) {
  await requireUser();
  if (state) await leave(true);
  const { data, error } = await supabase.rpc("redeem_pairing", { _code: code.trim(), _name: deviceName(), _kind: deviceKind() });
  if (error) throw new Error("Código inválido ou expirado.");
  const row = data?.[0];
  if (!row) throw new Error("Código inválido ou expirado.");
  const k = await deriveKey(password, row.salt);
  try {
    if ((await dec<string>(k, row.verifier)) !== "lia-link-ok") throw new Error();
  } catch {
    await supabase.from("sync_devices").delete().eq("id", row.device_id);
    throw new Error("Senha de sincronização incorreta. Gere um novo código e tente de novo.");
  }
  await persistLocal({ spaceId: row.space_id, deviceId: row.device_id }, k);
  await start();
}

/** Desvincula um aparelho (ou este, com remote=true apagando o registro). */
export async function unlinkDevice(id: string) {
  await supabase.from("sync_devices").delete().eq("id", id);
  if (id === state?.deviceId) await leave(false);
  else await refreshDevices();
}

async function leave(removeRemote: boolean) {
  if (removeRemote && state) await supabase.from("sync_devices").delete().eq("id", state.deviceId);
  stopEngine();
  state = null;
  key = null;
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(KNOWN_KEY);
  await saveKey(null).catch(() => undefined);
  setSnap({ status: "local", devices: [], deviceId: null, error: null });
}

/** Tipos de aparelho vinculados além deste (para a Lia saber a quem mandar comandos). */
export function remoteKinds(): ("mobile" | "desktop")[] {
  if (snap.status === "local") return [];
  return [...new Set(snap.devices.filter((d) => d.id !== snap.deviceId).map((d) => d.kind as "mobile" | "desktop"))];
}

export async function dispatchRemote(target: "mobile" | "desktop", cmd: RemoteCommand) {
  if (!state || !key) throw new Error("Lia Link desligado");
  const { error } = await supabase.from("sync_commands").insert({ space_id: state.spaceId, target, from_device: state.deviceId, payload: await enc(key, cmd) });
  if (error) throw error;
}

/** Grava uma fala da Lia numa conversa (vai para todos os aparelhos). */
export function appendLiaMessage(conversationId: string | undefined, content: string) {
  const list = convo.readConversations();
  const target = list.find((c) => c.id === conversationId) ?? list.find((c) => c.id === convo.readActiveId()) ?? list[0];
  if (!target) return;
  const msg: ChatMessage = { id: crypto.randomUUID(), role: "lia", content, createdAt: Date.now() };
  convo.writeConversations(list.map((c) => (c.id === target.id ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() } : c)));
  window.dispatchEvent(new Event(APPLIED_EVENT));
}
