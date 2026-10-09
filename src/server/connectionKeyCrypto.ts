// Server-only. Criptografia da chave de conexão de cada usuário.
// Usa Web Crypto (AES-256-GCM) para rodar no runtime Worker, sem node:crypto.
// Formato armazenado (inalterado): base64( iv[12] | tag[16] | ciphertext ).

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function key(): Promise<CryptoKey> {
  const raw = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  const bytes = b64ToBytes(raw);
  if (bytes.length !== 32) throw new Error("APP_USER_CONNECTION_KEY_SECRET inválido.");
  return crypto.subtle.importKey("raw", bytes as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptConnectionKey(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      await key(),
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  // Web Crypto devolve ciphertext+tag; separamos a tag para manter o formato iv|tag|ct.
  const ct = result.subarray(0, result.length - 16);
  const tag = result.subarray(result.length - 16);
  const packed = new Uint8Array(12 + 16 + ct.length);
  packed.set(iv, 0);
  packed.set(tag, 12);
  packed.set(ct, 28);
  return bytesToB64(packed);
}

export async function decryptConnectionKey(stored: string): Promise<string> {
  const buf = b64ToBytes(stored);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const joined = new Uint8Array(ct.length + 16);
  joined.set(ct, 0);
  joined.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    await key(),
    joined as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
