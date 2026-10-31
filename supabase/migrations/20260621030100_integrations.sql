-- Integrations: Google Calendar, Slack, Email, Offline sync

-- ── Google Calendar ──────────────────────────────────────────────
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

-- ── Slack ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  slack_user_id TEXT,
  slack_team_id TEXT,
  access_token TEXT,
  webhook_url TEXT,

  reminders_enabled BOOLEAN DEFAULT true,
  reminder_lead_minutes INTEGER DEFAULT 15,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ── Email notifications ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  email TEXT NOT NULL,
  reminders_enabled BOOLEAN DEFAULT true,
  reminder_lead_minutes INTEGER DEFAULT 30,
  daily_digest_enabled BOOLEAN DEFAULT false,
  daily_digest_time TIME DEFAULT '08:00:00',

  quiet_hours_start TIME DEFAULT '21:00:00',
  quiet_hours_end TIME DEFAULT '07:00:00',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE CASCADE,

  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,

  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending',
  retries INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ── Offline sync queue ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  device_id TEXT,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_data JSONB NOT NULL,
  client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

  status TEXT DEFAULT 'pending',
  conflict_detected BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_user ON public.calendar_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_user ON public.calendar_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_event ON public.calendar_sync_log(event_id);
CREATE INDEX IF NOT EXISTS idx_slack_integrations_user ON public.slack_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_integrations_slack_user ON public.slack_integrations(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_email_settings_user ON public.email_notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_send_at ON public.email_notification_queue(send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_offline_queue_user ON public.offline_sync_queue(user_id) WHERE status = 'pending';

-- RLS
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar" ON public.calendar_integrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users see own calendar logs" ON public.calendar_sync_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service insert calendar logs" ON public.calendar_sync_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Users manage own slack" ON public.slack_integrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own email settings" ON public.email_notification_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users see own email queue" ON public.email_notification_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service manage email queue" ON public.email_notification_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Users manage own sync queue" ON public.offline_sync_queue FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
