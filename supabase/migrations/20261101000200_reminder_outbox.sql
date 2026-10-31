-- Durable reminder plan / occurrence / delivery. Server-write only.
CREATE TABLE IF NOT EXISTS public.reminder_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_opt_in boolean NOT NULL DEFAULT false,
  canvas_email_opt_in boolean NOT NULL DEFAULT false,
  timezone text,
  quiet_hours jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reminder_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.scheduling_nodes(id) ON DELETE CASCADE,
  rule_id text NOT NULL DEFAULT 'lead_default',
  revision integer NOT NULL DEFAULT 0,
  cancelled boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, task_id, rule_id)
);

CREATE TABLE IF NOT EXISTS public.reminder_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.reminder_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurrence_id text NOT NULL,
  fire_at timestamptz NOT NULL,
  cancelled boolean NOT NULL DEFAULT false,
  UNIQUE (plan_id, occurrence_id)
);

CREATE TABLE IF NOT EXISTS public.reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES public.reminder_occurrences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  destination text NOT NULL,
  provider_key text NOT NULL,
  state text NOT NULL DEFAULT 'claimed',
  accepted_at timestamptz,
  failed_at timestamptz,
  UNIQUE (occurrence_id, channel, destination)
);

CREATE TABLE IF NOT EXISTS public.reminder_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'reconcile',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminder_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reminder_plans, public.reminder_occurrences, public.reminder_deliveries, public.reminder_outbox
  FROM anon, authenticated;
GRANT SELECT ON public.reminder_preferences TO authenticated;
GRANT ALL ON public.reminder_preferences, public.reminder_plans, public.reminder_occurrences,
  public.reminder_deliveries, public.reminder_outbox TO service_role;
DROP POLICY IF EXISTS reminder_prefs_owner ON public.reminder_preferences;
CREATE POLICY reminder_prefs_owner ON public.reminder_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
