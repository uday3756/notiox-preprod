-- Node Color Categorization + In-Node Color Picker (CEO handoff).
--
-- Two halves, one system:
--   * Auto: the AI tags each node with a `category`; similar nodes share a color
--     via a per-map category -> color map.
--   * Manual: the user recolors a node in the sheet. A per-node `color_override`
--     always wins over the category color.
--
-- Color precedence resolved client-side (resolveNodeColor):
--   color_override > category_colors[category] > deterministic palette > branch.
--
-- Idempotent (safe to re-run): IF NOT EXISTS everywhere.

-- 1) Nodes gain a category tag and an explicit per-node color override.
ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS color_override text;

-- Speeds up the "recolor the whole category" update (WHERE map_id + category).
CREATE INDEX IF NOT EXISTS idx_nodes_map_category
  ON public.nodes (map_id, category);

-- 2) Per-map category -> color map, so recoloring one "coaching" node can
--    recolor them all.
CREATE TABLE IF NOT EXISTS public.category_colors (
  map_id   uuid NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  category text NOT NULL,
  color    text NOT NULL,               -- hex, e.g. "#F2A65A"
  PRIMARY KEY (map_id, category)
);

-- RLS: a user may read/write category colors only for maps they own. Mirrors the
-- ownership model used by nodes / node_links (checked against maps.user_id).
ALTER TABLE public.category_colors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'category_colors'
      AND policyname = 'category_colors_owner_all'
  ) THEN
    CREATE POLICY category_colors_owner_all ON public.category_colors
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.maps m
          WHERE m.id = category_colors.map_id
            AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.maps m
          WHERE m.id = category_colors.map_id
            AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;
