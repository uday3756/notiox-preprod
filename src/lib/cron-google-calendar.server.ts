import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar.server";
import { pullGoogleChangesForAllUsers } from "@/lib/google-calendar.sync.server";

/**
 * GET /api/cron/google-calendar-sync — poll Google → Notio for Notio-owned events.
 * Same auth pattern as reminder / weekly-report crons (CRON_SECRET bearer).
 */
export async function handleGoogleCalendarSyncCron(request: Request): Promise<Response> {
  try {
    if (!FEATURE_FLAGS.googleCalendar) {
      return json({ ok: true, message: "feature disabled" }, 200);
    }
    if (!isGoogleCalendarConfigured()) {
      return json({ ok: true, message: "google calendar not configured" }, 200);
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[gcal-cron] CRON_SECRET is not configured - refusing to run");
      return json({ error: "Unauthorized" }, 401);
    }
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const result = await pullGoogleChangesForAllUsers();
    return json({ ok: true, ...result }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gcal-cron]", msg);
    return json({ error: msg }, 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
