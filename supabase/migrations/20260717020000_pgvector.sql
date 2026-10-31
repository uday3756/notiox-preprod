-- Feature 3 — Cross-map RAG: pgvector + node_embeddings.
--
-- One row per node. Embeddings are computed server-side (TanStack Start server
-- fn, secrets in process.env) and stored next to the node. RLS-scoped per user
-- so retrieval never crosses user boundaries.
--
-- Dimension 1536 = OpenAI text-embedding-3-small. If you switch models, drop
-- and recreate the column with the new dimension (the backfill script will
-- repopulate).
--
-- The extension create is wrapped in a DO block so a project that already has
-- it doesn't fail the migration. If the Supabase project doesn't have pgvector
-- enabled in the dashboard, this CREATE EXTENSION will fail — in that case the
-- rest of the app still works; weekly reports degrade to wins+task stats only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.node_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (node_id)
);

CREATE INDEX IF NOT EXISTS idx_node_embeddings_user
  ON public.node_embeddings(user_id);

CREATE INDEX IF NOT EXISTS idx_node_embeddings_user_created
  ON public.node_embeddings(user_id, created_at);

-- ivfflat index for cosine similarity (the operator class for vector cosine
-- distance). Build with a moderate lists count — works fine at the scale of a
-- single-user's nodes (hundreds to low thousands). For very large installs,
-- reindex with a larger lists count after a backfill.
CREATE INDEX IF NOT EXISTS idx_node_embeddings_embedding
  ON public.node_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.node_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own node embeddings"
  ON public.node_embeddings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own node embeddings"
  ON public.node_embeddings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own node embeddings"
  ON public.node_embeddings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own node embeddings"
  ON public.node_embeddings FOR DELETE USING (auth.uid() = user_id);
