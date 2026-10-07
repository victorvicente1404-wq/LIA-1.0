CREATE TABLE public.os_agent_tokens (
  user_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  last_seen timestamptz,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.os_agent_tokens TO authenticated;
GRANT ALL ON public.os_agent_tokens TO service_role;
ALTER TABLE public.os_agent_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.os_agent_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.os_agent_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.os_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target text NOT NULL CHECK (target IN ('desktop','mobile')),
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','running','done','failed','rejected')),
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_actions_user_idx ON public.os_actions(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.os_actions TO authenticated;
GRANT ALL ON public.os_actions TO service_role;
ALTER TABLE public.os_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.os_actions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own update" ON public.os_actions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);