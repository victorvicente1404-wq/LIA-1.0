// Server-only. Resolve o usuário autenticado quando existir, sem bloquear
// quem usa a Lia sem entrar na conta.
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

export async function resolveOptionalUserId(): Promise<string | null> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  if (token.split(".").length !== 3) return null;

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return String(data.claims.sub);
  } catch {
    return null;
  }
}
