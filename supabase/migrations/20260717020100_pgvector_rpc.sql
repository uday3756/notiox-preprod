-- Feature 3 — pgvector RPC helpers used by embeddings.server.ts.
--
-- Two functions:
--   upsert_node_embedding(p_node_id, p_map_id, p_user_id, p_text, p_embedding)
--     Upserts one row in node_embeddings by node_id. p_embedding is a string
--     literal like '[0.1,0.2,...]' which we cast to vector(1536).
--
--   search_node_embeddings(p_user_id, p_query, p_since, p_until, p_limit)
--     Returns the top-N node texts for a user within a date window, ranked by
--     cosine similarity to p_query. SECURITY DEFINER + RLS-bounded by user_id
--     so the service-role client can run it without leaking cross-user rows.

CREATE OR REPLACE FUNCTION public.upsert_node_embedding(
  p_node_id UUID,
  p_map_id UUID,
  p_user_id UUID,
  p_text TEXT,
  p_embedding TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.node_embeddings (node_id, map_id, user_id, text, embedding, updated_at)
  VALUES (p_node_id, p_map_id, p_user_id, p_text, p_embedding::vector(1536), now())
  ON CONFLICT (node_id) DO UPDATE
    SET text = EXCLUDED.text,
        embedding = EXCLUDED.embedding,
        map_id = EXCLUDED.map_id,
        updated_at = now();
END$$;

CREATE OR REPLACE FUNCTION public.search_node_embeddings(
  p_user_id UUID,
  p_query TEXT,
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 8
) RETURNS TABLE (
  text TEXT,
  map_id UUID,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    ne.text,
    ne.map_id,
    1 - (ne.embedding <=> p_query::vector(1536)) AS similarity
  FROM public.node_embeddings ne
  WHERE ne.user_id = p_user_id
    AND ne.created_at >= p_since
    AND ne.created_at <= p_until
  ORDER BY ne.embedding <=> p_query::vector(1536)
  LIMIT p_limit;
$$;

-- Allow any authenticated user to call these helpers; the helpers themselves
-- enforce user_id scoping, so a user can only ever read/insert their own rows.
GRANT EXECUTE ON FUNCTION public.upsert_node_embedding(UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_node_embeddings(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;
