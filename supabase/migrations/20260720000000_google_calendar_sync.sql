-- Google Calendar sync: link scheduling_nodes ↔ Google events; harden integrations.
-- Safe to re-run. Creates calendar_integrations if an older env never applied
-- 20260621030100_integrations.sql.

CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  provider TEXT NOT NULL DEFAULT 'google',
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,

  calendar_id TEXT,
  is_syncing BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMP WITH TIME ZONE,

  auto_import BOOLEAN DEFAULT true,
  auto_export BOOLEAN DEFAULT true,
  conflict_resolution TEXT DEFAULT 'ask',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.calendar_integrations(id) ON DELETE CASCADE,

  action TEXT NOT NULL,
  event_id TEXT,
  task_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE SET NULL,

  details JSONB,
  status TEXT DEFAULT 'success',
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_integrations_user ON public.calendar_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_user ON public.calendar_sync_log(user_id);

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_sync_log'
      AND policyname = 'Users see own calendar logs'
  ) THEN
    CREATE POLICY "Users see own calendar logs"
      ON public.calendar_sync_log FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_sync_log'
      AND policyname = 'Service insert calendar logs'
  ) THEN
    CREATE POLICY "Service insert calendar logs"
      ON public.calendar_sync_log FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.scheduling_nodes
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE INDEX IF NOT EXISTS scheduling_nodes_google_event_id_idx
  ON public.scheduling_nodes (user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

ALTER TABLE public.calendar_integrations
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS watch_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS watch_resource_id TEXT,
  ADD COLUMN IF NOT EXISTS watch_expiration TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_token TEXT;

COMMENT ON COLUMN public.scheduling_nodes.google_event_id IS
  'Google Calendar event id for Notio-owned synced events';

COMMENT ON COLUMN public.calendar_integrations.sync_enabled IS
  'When false, Notio tasks are not pushed to Google';

-- Harden token access: clients must not read/write OAuth tokens.
DROP POLICY IF EXISTS "Users manage own calendar" ON public.calendar_integrations;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_integrations'
      AND policyname = 'Users see own calendar status'
  ) THEN
    CREATE POLICY "Users see own calendar status"
      ON public.calendar_integrations
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

REVOKE ALL ON public.calendar_integrations FROM anon, authenticated;
GRANT SELECT (
  id,
  user_id,
  provider,
  calendar_id,
  is_syncing,
  last_sync_at,
  auto_import,
  auto_export,
  conflict_resolution,
  sync_enabled,
  created_at,
  updated_at
) ON public.calendar_integrations TO authenticated;
