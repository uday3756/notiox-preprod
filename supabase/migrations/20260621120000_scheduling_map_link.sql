-- Link scheduled tasks to mindmaps and map nodes
ALTER TABLE public.scheduling_nodes
  ADD COLUMN IF NOT EXISTS map_id UUID REFERENCES public.maps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS node_id UUID REFERENCES public.nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_map_id ON public.scheduling_nodes(map_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_node_id ON public.scheduling_nodes(node_id);
