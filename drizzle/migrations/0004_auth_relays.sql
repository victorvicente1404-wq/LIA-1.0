CREATE TABLE public.auth_relays (
  id_hash text PRIMARY KEY,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_relays TO service_role;
ALTER TABLE public.auth_relays ENABLE ROW LEVEL SECURITY;