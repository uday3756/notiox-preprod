/**
 * Feature 3 — Cross-map RAG: client-callable server fn for embed-on-write.
 *
 * `embedMapNodes` is invoked by the client (capture.tsx) AFTER
 * `structureThought` returns the new mapId. This keeps the existing AI
 * extraction flow in `notio.functions.ts` completely untouched — the
 * embedding step is a separate, isolated server fn rather than a side-effect
 * inside `structureThought`.
 *
 * Gated behind FEATURE_FLAGS.crossMapRag — both the client (capture.tsx) and
 * this handler short-circuit when the flag is off, so production with RAG
 * disabled never spends OpenAI calls.
 *
 * Best-effort by design: failures are logged and swallowed. The user's map
 * is already saved by the time this runs; a failed embedding pass must never
 * surface as an error to the user.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

const EmbedMapNodesInput = z.object({
  mapId: z.string().uuid(),
});

export const embedMapNodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => EmbedMapNodesInput.parse(input))
  .handler(async ({ data, context }) => {
    // Defense-in-depth: the client also checks the flag, but the server is
    // the source of truth — never trust the client.
    if (!FEATURE_FLAGS.crossMapRag) {
      return { embedded: 0, reason: "feature disabled" };
    }

    try {
      // Dynamic import keeps embeddings.server (which transitively imports
      // the service-role client) out of the client bundle.
      const { upsertNodeEmbedding } = await import("@/lib/embeddings.server");

      const { data: nodes, error } = await context.supabase
        .from("nodes")
        .select("id, label, detail")
        .eq("map_id", data.mapId)
        .eq("user_id", context.userId);

      if (error) {
        console.error("[embedMapNodes] fetch nodes failed:", error.message);
        return { embedded: 0, reason: "fetch failed" };
      }
      if (!nodes || nodes.length === 0) {
        return { embedded: 0, reason: "no nodes" };
      }

      let embedded = 0;
      for (const n of nodes) {
        const text = `${n.label}. ${n.detail ?? ""}`.trim();
        if (!text) continue;
        await upsertNodeEmbedding({
          nodeId: n.id,
          mapId: data.mapId,
          userId: context.userId,
          text,
        });
        // upsertNodeEmbedding silently skips when OPENAI_API_KEY is unset or
        // the OpenAI call fails, so we still count the attempt — the count
        // reflects "nodes we tried to embed", not "OpenAI succeeded".
        embedded += 1;
      }
      return { embedded, reason: "ok" };
    } catch (err) {
      // Never throw — this is a background enhancement.
      console.error("[embedMapNodes] failed:", err);
      return { embedded: 0, reason: "error" };
    }
  });
