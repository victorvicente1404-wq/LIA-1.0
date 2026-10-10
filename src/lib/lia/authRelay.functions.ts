import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Relé de login do app nativo: guarda por até 3 minutos o retorno do Google
// já cifrado no navegador. A chave nunca chega aqui; só o hash do identificador.
const MAX_AGE_MS = 3 * 60 * 1000;
const idHash = z.string().regex(/^[a-f0-9]{64}$/);

export const putAuthRelay = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({ idHash, ciphertext: z.string().min(1).max(20000), iv: z.string().min(1).max(64) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
    await supabaseAdmin.from("auth_relays").delete().lt("created_at", cutoff);
    const { error } = await supabaseAdmin
      .from("auth_relays")
      .insert({ id_hash: data.idHash, ciphertext: data.ciphertext, iv: data.iv });
    if (error) return { ok: false };
    return { ok: true };
  });

export const takeAuthRelay = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ idHash }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("auth_relays")
      .delete()
      .eq("id_hash", data.idHash)
      .select("ciphertext, iv, created_at")
      .maybeSingle();
    if (!row) return { found: false as const };
    if (Date.now() - new Date(row.created_at).getTime() > MAX_AGE_MS) return { found: false as const };
    return { found: true as const, ciphertext: row.ciphertext, iv: row.iv };
  });
