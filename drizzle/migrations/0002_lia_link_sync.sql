CREATE TABLE public.sync_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  salt text NOT NULL,
  verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sync_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.sync_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Dispositivo',
  kind text NOT NULL DEFAULT 'desktop',
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sync_pairings (
  code text PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES public.sync_spaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false
);
CREATE TABLE public.sync_blobs (
  space_id uuid NOT NULL REFERENCES public.sync_spaces(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  ciphertext text NOT NULL,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  device_id uuid,
  PRIMARY KEY (space_id, item_key)
);
CREATE TABLE public.sync_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.sync_spaces(id) ON DELETE CASCADE,
  target text NOT NULL,
  from_device uuid,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_spaces, public.sync_devices, public.sync_pairings, public.sync_blobs, public.sync_commands TO authenticated;
GRANT ALL ON public.sync_spaces, public.sync_devices, public.sync_pairings, public.sync_blobs, public.sync_commands TO service_role;

ALTER TABLE public.sync_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_commands ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_space_member(_space uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sync_spaces WHERE id = _space AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.sync_devices WHERE space_id = _space AND user_id = auth.uid())
$$;

CREATE POLICY "member read space" ON public.sync_spaces FOR SELECT TO authenticated USING (public.is_space_member(id));
CREATE POLICY "own create space" ON public.sync_spaces FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner delete space" ON public.sync_spaces FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "member read devices" ON public.sync_devices FOR SELECT TO authenticated USING (public.is_space_member(space_id));
CREATE POLICY "owner add device" ON public.sync_devices FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.sync_spaces s WHERE s.id = space_id AND s.owner_id = auth.uid()));
CREATE POLICY "own update device" ON public.sync_devices FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "member unlink device" ON public.sync_devices FOR DELETE TO authenticated USING (public.is_space_member(space_id));

CREATE POLICY "member read pairings" ON public.sync_pairings FOR SELECT TO authenticated USING (public.is_space_member(space_id));
CREATE POLICY "member create pairing" ON public.sync_pairings FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.is_space_member(space_id));

CREATE POLICY "member read blobs" ON public.sync_blobs FOR SELECT TO authenticated USING (public.is_space_member(space_id));
CREATE POLICY "member write blobs" ON public.sync_blobs FOR INSERT TO authenticated WITH CHECK (public.is_space_member(space_id));
CREATE POLICY "member update blobs" ON public.sync_blobs FOR UPDATE TO authenticated USING (public.is_space_member(space_id)) WITH CHECK (public.is_space_member(space_id));

CREATE POLICY "member read commands" ON public.sync_commands FOR SELECT TO authenticated USING (public.is_space_member(space_id));
CREATE POLICY "member create commands" ON public.sync_commands FOR INSERT TO authenticated WITH CHECK (public.is_space_member(space_id));
CREATE POLICY "member update commands" ON public.sync_commands FOR UPDATE TO authenticated USING (public.is_space_member(space_id)) WITH CHECK (public.is_space_member(space_id));

-- Resgate do código: quem ainda não é membro entra no espaço com um código válido.
CREATE OR REPLACE FUNCTION public.redeem_pairing(_code text, _name text, _kind text)
RETURNS TABLE(space_id uuid, salt text, verifier text, device_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.sync_pairings; s public.sync_spaces; d uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO p FROM public.sync_pairings WHERE code = _code FOR UPDATE;
  IF p.code IS NULL OR p.used OR p.expires_at < now() THEN RAISE EXCEPTION 'codigo invalido ou expirado'; END IF;
  UPDATE public.sync_pairings SET used = true WHERE code = _code;
  SELECT * INTO s FROM public.sync_spaces WHERE id = p.space_id;
  INSERT INTO public.sync_devices(space_id, user_id, name, kind)
    VALUES (s.id, auth.uid(), left(coalesce(_name,'Dispositivo'),80), CASE WHEN _kind = 'mobile' THEN 'mobile' ELSE 'desktop' END)
    RETURNING id INTO d;
  RETURN QUERY SELECT s.id, s.salt, s.verifier, d;
END $$;
REVOKE ALL ON FUNCTION public.redeem_pairing(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_pairing(text, text, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_blobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_devices;