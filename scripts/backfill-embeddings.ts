/**
 * Feature 3 — one-time backfill of node_embeddings for existing maps.
 *
 * Run with:  npx ts-node --esm scripts/backfill-embeddings.ts
 *   (or: node --loader ts-node/esm scripts/backfill-embeddings.ts)
 *
 * Requires these env vars to be set in the shell (or .env loaded):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 *
 * Iterates every node in the project (via the service-role admin client),
 * batches their label+detail through OpenAI's embedding API, and upserts
 * into node_embeddings. Skips nodes that already have an embedding row (so
 * it's re-runnable). Safe to interrupt — re-running picks up where it left off.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";
const BATCH = 64; // OpenAI accepts up to 100 inputs per call; 64 is safe.

async function embed(texts: string[]): Promise<number[][] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (texts.length === 0) return [];
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    console.error("OpenAI HTTP", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  return (json.data ?? []).map((d) => d.embedding ?? []);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set — nothing to backfill. Set it and re-run.");
    process.exit(1);
  }

  let done = 0;
  let skipped = 0;
  let page = 0;
  const PAGE_SIZE = 500;

  while (true) {
    const { data: nodes, error } = await supabase
      .from("nodes")
      .select("id, map_id, user_id, label, detail")
      .order("created_at", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) {
      console.error("nodes query failed:", error.message);
      break;
    }
    if (!nodes || nodes.length === 0) break;

    // Skip nodes that already have an embedding row.
    const ids = nodes.map((n) => n.id);
    const { data: existing } = await supabase
      .from("node_embeddings")
      .select("node_id")
      .in("node_id", ids);
    const have = new Set((existing ?? []).map((r) => r.node_id));
    const pending = nodes.filter((n) => !have.has(n.id));
    skipped += nodes.length - pending.length;

    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const texts = batch.map((n) => `${n.label}. ${n.detail ?? ""}`.trim());
      const vecs = await embed(texts);
      if (!vecs) {
        console.error("Embedding failed at batch — aborting.");
        process.exit(1);
      }
      const rows = batch.map((n, j) => ({
        node_id: n.id,
        map_id: n.map_id,
        user_id: n.user_id,
        text: texts[j],
        embedding: `[${vecs[j].join(",")}]`,
      }));
      // Insert directly with the vector literal — supabase-js will pass it as
      // a string and Postgres will cast it to vector(1536) on insert.
      const { error: insErr } = await supabase.from("node_embeddings").insert(rows as never);
      if (insErr) {
        console.error("insert failed:", insErr.message, "— first row:", rows[0]?.node_id);
      } else {
        done += rows.length;
        console.log(`embedded ${done} (skipped ${skipped})`);
      }
    }

    if (nodes.length < PAGE_SIZE) break;
    page += 1;
  }

  console.log(`Done. Embedded ${done} nodes, skipped ${skipped} (already had rows).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
