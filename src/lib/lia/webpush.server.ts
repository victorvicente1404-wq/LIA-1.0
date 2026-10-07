// Server-only. Web Push (VAPID ES256 + aes128gcm) com Web Crypto, compatível com o Worker.
import { VAPID_PUBLIC_KEY } from "./push-config";

const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

async function vapidAuth(endpoint: string) {
  const jwk = JSON.parse(process.env["VAPID_PRIVATE_JWK"] ?? "{}");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: "mailto:lia.assistente.ai@gmail.com",
      }),
    ),
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${payload}`));
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${VAPID_PUBLIC_KEY}`;
}

async function encrypt(payload: string, p256dh: string, auth: string) {
  const clientPub = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const localPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const clientKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), clientPub, localPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(enc.encode(payload), new Uint8Array([2]))),
  );
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([localPub.length]), localPub, cipher);
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type StoredSub = { id: string; endpoint: string; p256dh: string; auth: string };

/** Retorna o status HTTP do serviço de push (404/410 = inscrição expirada). */
export async function sendWebPush(sub: StoredSub, msg: PushPayload) {
  const body = await encrypt(JSON.stringify(msg), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "high",
    },
    body,
  });
  return res.status;
}

/** Envia para todas as inscrições do usuário e apaga as expiradas. */
export async function pushToUser(userId: string, msg: PushPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  let sent = 0;
  for (const sub of data ?? []) {
    try {
      const status = await sendWebPush(sub, msg);
      if (status === 404 || status === 410) await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
      else if (status < 300) sent++;
      else console.warn("push status", status);
    } catch (e) {
      console.warn("push falhou:", (e as Error).message);
    }
  }
  return sent;
}
