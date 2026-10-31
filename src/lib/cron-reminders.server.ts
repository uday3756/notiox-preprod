/**
 * Handles GET /api/cron/reminders. Called from src/server.ts.
 * Fail-closed CRON_SECRET, then durable reconcile/claim/send.
 */
export async function handleReminderCron(request: Request): Promise<Response> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[cron] CRON_SECRET is not configured - refusing to run");
      return json({ error: "Unauthorized" }, 401);
    }
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { reconcileAndDispatchReminders } = await import("./reminders.server");
    const result = await reconcileAndDispatchReminders(new Date());
    return json(result, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[cron] error:", msg);
    return json({ error: "Internal Server Error", detail: msg }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
