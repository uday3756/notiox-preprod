/**
 * Feature 2 — Weekly Reflection Report cron handler.
 *
 * Called from src/server.ts when GET /api/cron/weekly-report hits. Same auth
 * pattern as handleReminderCron: requires CRON_SECRET bearer token.
 *
 * Iterates every user_working_hours row whose weekly_report_day matches today
 * (in UTC — the cron runs once a day; per-user timezone narrowing would need
 * the cron to run hourly, which is out of scope here). For each matching user,
 * runs generateWeeklyReportForUser. Failures are logged and don't abort the
 * whole run.
 *
 * NEW: Sends an email notification when the report is ready.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateWeeklyReportForUser } from "@/lib/weekly-report.functions";
import { sendWeeklyReportNotification } from "@/lib/email.server";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export async function handleWeeklyReportCron(request: Request): Promise<Response> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[cron-weekly] CRON_SECRET not configured - refusing to run");
      return json({ error: "Unauthorized" }, 401);
    }
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Feature flag gate — production with FEATURE_WEEKLY_REFLECTION=0 should
    // be a no-op. Return 200 so Vercel Cron doesn't retry, with a clear
    // message for operators.
    if (!FEATURE_FLAGS.weeklyReflection) {
      return json({ run: "skipped", reason: "feature disabled (FEATURE_WEEKLY_REFLECTION=0)" }, 200);
    }

    const todayName = DAY_NAMES[new Date().getUTCDay()];

    // Every user whose weekly_report_day is today. We don't filter by hour
    // here — the cron runs once daily at 8 AM UTC (vercel.json), which is a
    // reasonable "Sunday evening / Monday morning" anchor for most timezones.
    const { data: users, error } = await supabaseAdmin
      .from("user_working_hours")
      .select("user_id, weekly_report_day, timezone")
      .eq("weekly_report_day", todayName);

    if (error) {
      console.error("[cron-weekly] fetch users failed:", error.message);
      return json({ error: "fetch failed", detail: error.message }, 500);
    }

    if (!users || users.length === 0) {
      return json({ run: todayName, generated: 0, reason: "no users due today" }, 200);
    }

    let generated = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (const u of users) {
      try {
        const result = await generateWeeklyReportForUser(u.user_id, new Date());
        if (result) {
          generated += 1;
          
          // Send email notification
          try {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("email, full_name")
              .eq("id", u.user_id)
              .single();

            if (profile?.email) {
              await sendWeeklyReportNotification(profile.email, profile.full_name || "there");
            }
          } catch (emailErr) {
            console.error(`[cron-weekly] email notification failed for ${u.user_id}:`, emailErr);
            // Don't fail the whole report generation if email fails
          }
        } else {
          skipped += 1;
        }

        // EF score + weekly patterns — same job, same cadence as the report
        // (handoff §8: "one scheduled function, same job as the weekly report").
        // Runs whether or not a report was generated; never blocks the report.
        try {
          const { computeEfForUser } = await import("./ef/compute.server");
          await computeEfForUser(u.user_id, u.timezone || "UTC", new Date());
        } catch (efErr) {
          console.error(`[cron-weekly] EF compute failed for ${u.user_id}:`, efErr);
        }
      } catch (err) {
        console.error(`[cron-weekly] user ${u.user_id} failed:`, err);
        failed.push(u.user_id);
      }
    }

    return json({ run: todayName, generated, skipped, failed: failed.length }, 200);
  } catch (err) {
    console.error("[cron-weekly] error:", err);
    return json({ error: "Internal Server Error" }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
