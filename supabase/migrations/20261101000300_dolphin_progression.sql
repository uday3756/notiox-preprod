-- Task links + XP size contracts. Complements 20261023000100 canonical completion.
CREATE TABLE IF NOT EXISTS public.task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.scheduling_nodes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);

ALTER TABLE public.scheduling_nodes
  ADD COLUMN IF NOT EXISTS xp_size text NOT NULL DEFAULT 'small';

ALTER TABLE public.dolphin_profiles
  ADD COLUMN IF NOT EXISTS lifetime_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'leaf';

ALTER TABLE public.xp_ledger DROP CONSTRAINT IF EXISTS xp_ledger_delta_check;
ALTER TABLE public.xp_ledger ADD CONSTRAINT xp_ledger_delta_check CHECK (delta IN (-60, -25, -10, 10, 25, 60));

ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_links_owner ON public.task_links;
CREATE POLICY task_links_owner ON public.task_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.task_links FROM anon, authenticated;
GRANT SELECT ON public.task_links TO authenticated;
GRANT ALL ON public.task_links TO service_role;
