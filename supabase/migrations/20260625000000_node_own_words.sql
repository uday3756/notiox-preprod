-- Feature 7: optional "explain in your own words" text per node.
-- The explanation itself is map content and lives on the node (Supabase).
-- The user's derived talking-style stays local-only on device (never stored here).

ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS own_words text;

-- Existing RLS on public.nodes already restricts rows to the owning user,
-- so no new policies are needed for this column.
