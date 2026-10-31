-- Canvas identity / source-aware scheduling. Staging first. Idempotent.
ALTER TABLE public.canvas_connections
  ADD COLUMN IF NOT EXISTS tenant_id text,
  ADD COLUMN IF NOT EXISTS canvas_user_id text;

ALTER TABLE public.scheduling_nodes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'notio',
  ADD COLUMN IF NOT EXISTS source_tenant_id text,
  ADD COLUMN IF NOT EXISTS source_canvas_user_id text,
  ADD COLUMN IF NOT EXISTS source_course_id text,
  ADD COLUMN IF NOT EXISTS source_assignment_id text,
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS tombstone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merge_redirect_id uuid;

ALTER TABLE public.canvas_assignments
  ADD COLUMN IF NOT EXISTS tenant_id text,
  ADD COLUMN IF NOT EXISTS canvas_user_id text,
  ADD COLUMN IF NOT EXISTS scheduling_node_id uuid REFERENCES public.scheduling_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_revision text;

CREATE TABLE IF NOT EXISTS public.canvas_credentials (
  connection_id uuid PRIMARY KEY REFERENCES public.canvas_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  epoch integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.canvas_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.canvas_connections(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'queued',
  lease_until timestamptz,
  fence_token text,
  epoch integer NOT NULL DEFAULT 1,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.canvas_sync_stage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.canvas_sync_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS canvas_active_ownership
  ON public.canvas_connections (tenant_id, canvas_user_id)
  WHERE tenant_id IS NOT NULL AND canvas_user_id IS NOT NULL AND state <> 'disconnected';

DROP INDEX IF EXISTS public.uq_scheduling_nodes_user_title_start;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduling_nodes_user_title_start_notio
  ON public.scheduling_nodes (user_id, title, start_time)
  WHERE source = 'notio' AND start_time IS NOT NULL AND COALESCE(tombstone, false) = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduling_nodes_canvas_source
  ON public.scheduling_nodes (user_id, source_tenant_id, source_canvas_user_id, source_course_id, source_assignment_id)
  WHERE source = 'canvas' AND source_assignment_id IS NOT NULL AND COALESCE(tombstone, false) = false;

ALTER TABLE public.canvas_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_sync_stage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canvas_credentials FROM anon, authenticated;
GRANT ALL ON public.canvas_credentials TO service_role;
DROP POLICY IF EXISTS canvas_jobs_owner ON public.canvas_sync_jobs;
CREATE POLICY canvas_jobs_owner ON public.canvas_sync_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS canvas_stage_owner ON public.canvas_sync_stage;
CREATE POLICY canvas_stage_owner ON public.canvas_sync_stage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
