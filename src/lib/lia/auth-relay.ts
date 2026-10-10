// Criptografia do relé de login (Web Crypto). O segredo fica só no app e na URL de retorno.
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newRelaySecret(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function relayIdHash(secret: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(`id:${secret}`));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("");
}

async function relayKey(secret: string) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`key:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptRelay(secret: string, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await relayKey(secret), enc.encode(text));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}

export async function decryptRelay(secret: string, ciphertext: string, iv: string) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) as BufferSource },
    await relayKey(secret),
    unb64(ciphertext) as BufferSource,
  );
  return dec.decode(pt);
}

export const RELAY_STORAGE_KEY = "lia-auth-relay";
