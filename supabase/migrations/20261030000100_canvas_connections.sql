-- Canvas LMS direct-API pilot connections. Tokens stay server-side only.
CREATE TABLE IF NOT EXISTS public.canvas_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution text NOT NULL,
  domain text NOT NULL,
  token_ciphertext text NOT NULL,
  connection_generation bigint NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'disconnected'
    CHECK (state IN ('disconnected','syncing','connected','retryable_error','auth_required','restricted')),
  last_successful_sync timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

CREATE TABLE IF NOT EXISTS public.canvas_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.canvas_connections(id) ON DELETE CASCADE,
  institution text NOT NULL,
  course_id text NOT NULL,
  assignment_id text NOT NULL,
  source_url text NOT NULL,
  title text NOT NULL,
  official_due_at timestamptz,
  personal_due_at timestamptz,
  submission text NOT NULL DEFAULT 'unknown'
    CHECK (submission IN ('submitted','not_submitted','unknown')),
  previous_official_due_at timestamptz,
  deadline_changed_at timestamptz,
  last_successful_sync timestamptz,
  task_id uuid REFERENCES public.scheduling_nodes(id) ON DELETE SET NULL,
  UNIQUE (user_id, institution, course_id, assignment_id)
);

ALTER TABLE public.canvas_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read_canvas_connections ON public.canvas_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY owner_read_canvas_assignments ON public.canvas_assignments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.canvas_connections, public.canvas_assignments FROM anon, authenticated;
GRANT SELECT ON public.canvas_connections, public.canvas_assignments TO authenticated;
GRANT ALL ON public.canvas_connections, public.canvas_assignments TO service_role;
