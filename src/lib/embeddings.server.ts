/**
 * Feature 3 — Cross-map RAG: server-side embeddings helper.
 *
 * Uses OpenAI's text-embedding-3-small (1536 dims) via direct fetch — no new
 * npm SDK. The API key is read from process.env at runtime and never ships to
 * the client (this file is .server.ts and only imported from server fns).
 *
 * Graceful degradation (per spec: "degrade gracefully, never block"):
 *   - If OPENAI_API_KEY is unset, embedTexts() returns null. Callers must
 *     treat null as "skip RAG" and continue without retrieved context.
 *
 * Why OpenAI and not Anthropic: Anthropic has no embeddings API. Why not
 * OpenRouter: the existing openrouter.server.ts is wired for free chat
 * models; OpenRouter's free embedding tier is unreliable. OpenAI's
 * text-embedding-3-small is the standard, cheap ($0.02/1M tokens), and
 * available everywhere.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const OPENAI_URL = "https://api.openai.com/v1/embeddings";

export function isEmbeddingsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Embed an array of texts. Returns null if unconfigured or on failure —
 * callers should treat null as "skip RAG" and continue.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!isEmbeddingsConfigured()) return null;
  // Skip empty / whitespace-only inputs to avoid wasting tokens.
  const cleaned = texts.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: cleaned }),
    });
    if (!res.ok) {
      console.error("[embeddings] OpenAI HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    return (json.data ?? []).map((d) => d.embedding ?? []).filter((v) => v.length === EMBEDDING_DIM);
  } catch (err) {
    console.error("[embeddings] failed:", err);
    return null;
  }
}

/**
 * Upsert one node's embedding into node_embeddings. Best-effort: never throws
 * (the caller's primary work — saving the node — must not fail because the
 * embedding step did).
 */
export async function upsertNodeEmbedding(params: {
  nodeId: string;
  mapId: string;
  userId: string;
  text: string;
}): Promise<void> {
  const text = params.text.trim();
  if (!text) return;
  const [vec] = (await embedTexts([text])) ?? [null];
  if (!vec) return; // unconfigured or failed — skip silently

  // Upsert by node_id (UNIQUE constraint). Use raw SQL so we can bind the
  // vector as a string literal — supabase-js can't type a JS array as vector.
  const vectorLiteral = `[${vec.join(",")}]`;
  const { error } = await supabaseAdmin.rpc("upsert_node_embedding", {
    p_node_id: params.nodeId,
    p_map_id: params.mapId,
    p_user_id: params.userId,
    p_text: text,
    p_embedding: vectorLiteral,
  });
  if (error) {
    console.error("[embeddings] upsert rpc failed:", error.message);
  }
}

/**
 * Retrieve the top-N most relevant node texts for a user within a date window,
 * ranked by cosine similarity to the query embedding. Returns an array of
 * { text, map_id, similarity } — the LLM only sees the text, never the
 * underlying user-verbatim admissions (the tone filter still runs on the
 * final report regardless).
 *
 * Returns [] if embeddings aren't configured or no matches found.
 */
export async function retrieveRelevantNodes(params: {
  userId: string;
  queryText: string;
  sinceIso: string; // inclusive lower bound on created_at
  untilIso: string; // inclusive upper bound
  limit?: number;
}): Promise<{ text: string; map_id: string; similarity: number }[]> {
  const limit = params.limit ?? 8;
  const [queryVec] = (await embedTexts([params.queryText])) ?? [null];
  if (!queryVec) return [];

  const vectorLiteral = `[${queryVec.join(",")}]`;
  const { data, error } = await supabaseAdmin.rpc("search_node_embeddings", {
    p_user_id: params.userId,
    p_query: vectorLiteral,
    p_since: params.sinceIso,
    p_until: params.untilIso,
    p_limit: limit,
  });
  if (error) {
    console.error("[embeddings] search rpc failed:", error.message);
    return [];
  }
  return (data ?? []) as { text: string; map_id: string; similarity: number }[];
}
