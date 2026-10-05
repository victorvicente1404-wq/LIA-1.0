CREATE TABLE public.custom_api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'tool' CHECK (type IN ('tool','llm_provider')),
  description text NOT NULL DEFAULT '',
  api_url text NOT NULL,
  method text NOT NULL DEFAULT 'POST' CHECK (method IN ('GET','POST','PUT','DELETE')),
  param_location text NOT NULL DEFAULT 'auto' CHECK (param_location IN ('auto','body','query')),
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameters_schema jsonb NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  model_name text,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_api_integrations TO authenticated;
GRANT ALL ON public.custom_api_integrations TO service_role;
ALTER TABLE public.custom_api_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.custom_api_integrations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.custom_api_integrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.custom_api_integrations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.custom_api_integrations FOR DELETE TO authenticated USING (auth.uid() = user_id);