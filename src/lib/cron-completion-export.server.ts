import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { flushAllCompletionExports } from "@/lib/task-completion.server";

/**
 * GET /api/cron/completion-export-retry — leased-style sweep of durable
 * completion → Google Calendar outbox rows. Auth matches other crons.
 */
export async function handleCompletionExportRetryCron(request: Request): Promise<Response> {
  try {
    if (!FEATURE_FLAGS.googleCalendar) {
      return json({ ok: true, message: "feature disabled" }, 200);
    }
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[completion-export-cron] CRON_SECRET is not configured");
      return json({ error: "Unauthorized" }, 401);
    }
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return json({ error: "Unauthorized" }, 401);
    }
    const result = await flushAllCompletionExports();
    return json({ ok: true, ...result }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[completion-export-cron]", msg);
    return json({ error: msg }, 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
