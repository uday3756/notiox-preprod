import { supabaseAdmin as supabase } from "@/integrations/supabase/client.server";
import { FEATURE_FLAGS } from "./feature-flags";

export async function handleCanvasCron(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return json({ error: "Unauthorized" }, 401);
  if (request.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!FEATURE_FLAGS.canvasDispatch) {
    return json({ ok: true, message: "canvas dispatch disabled" }, 200);
  }

  const now = new Date().toISOString();
  const { data: jobs } = await supabase
    .from("canvas_sync_jobs")
    .select("id, user_id, state")
    .in("state", ["queued", "retry"])
    .limit(5);

  let processed = 0;
  for (const job of jobs ?? []) {
    await supabase
      .from("canvas_sync_jobs")
      .update({ state: "running", lease_until: now, updated_at: now })
      .eq("id", job.id);
    processed += 1;
    // Isolated broker work happens in canvas-sync.server when MCP is configured.
  }
  return json({ processed }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
