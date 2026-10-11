CREATE TABLE public.lia_device_telemetry (
  user_id uuid NOT NULL,
  device_key text NOT NULL,
  name text NOT NULL DEFAULT 'Dispositivo',
  kind text NOT NULL DEFAULT 'desktop',
  battery integer,
  charging boolean,
  latitude double precision,
  longitude double precision,
  altitude double precision,
  accuracy double precision,
  network text,
  model text,
  screen_on boolean,
  foreground_app text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lia_device_telemetry TO authenticated;
GRANT ALL ON public.lia_device_telemetry TO service_role;
ALTER TABLE public.lia_device_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own telemetry all" ON public.lia_device_telemetry FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.lia_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_key text NOT NULL,
  app text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lia_notifications_user_posted ON public.lia_notifications(user_id, posted_at DESC);
GRANT SELECT, INSERT, DELETE ON public.lia_notifications TO authenticated;
GRANT ALL ON public.lia_notifications TO service_role;
ALTER TABLE public.lia_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notif select" ON public.lia_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own notif insert" ON public.lia_notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notif delete" ON public.lia_notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lia_device_telemetry;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lia_notifications;