-- Manual node-to-node connections ("Branch a Thought").
-- These are arbitrary links the user draws between two existing nodes,
-- separate from the tree's parent/child structure.

CREATE TABLE IF NOT EXISTS public.node_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- No duplicate link in the same direction; no self-links.
  CONSTRAINT node_links_distinct CHECK (source_node_id <> target_node_id),
  CONSTRAINT node_links_unique UNIQUE (source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_node_links_map ON public.node_links(map_id);

ALTER TABLE public.node_links ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage links on their own maps.
DROP POLICY IF EXISTS "node_links_select_own" ON public.node_links;
CREATE POLICY "node_links_select_own" ON public.node_links
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "node_links_insert_own" ON public.node_links;
CREATE POLICY "node_links_insert_own" ON public.node_links
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.maps m WHERE m.id = map_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "node_links_delete_own" ON public.node_links;
CREATE POLICY "node_links_delete_own" ON public.node_links
  FOR DELETE USING (user_id = auth.uid());
