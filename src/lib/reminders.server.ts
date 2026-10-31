import { supabaseAdmin as supabase } from "@/integrations/supabase/client.server";
import { sendTaskReminderEmail } from "@/lib/email.server";

export type ReminderClaimResult = {
  sent: number;
  skipped: number;
  failed: number;
};

function providerKey(userId: string, taskId: string, fireAt: string) {
  return `email:${userId}:${taskId}:${fireAt}`;
}

/**
 * Plan + claim + send for due pending tasks. Reuses delivery keys on retry.
 * Canvas/server-managed rows require reminder_preferences.canvas_email_opt_in.
 */
export async function reconcileAndDispatchReminders(now = new Date()): Promise<ReminderClaimResult> {
  const windowEnd = new Date(now.getTime() + 30 * 60000);
  const { data: tasks, error } = await supabase
    .from("scheduling_nodes")
    .select("id, title, start_time, category, user_id, source, reminder_sent_at, tombstone, status")
    .eq("status", "pending")
    .is("reminder_sent_at", null)
    .not("start_time", "is", null)
    .gte("start_time", now.toISOString())
    .lte("start_time", windowEnd.toISOString());

  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of tasks ?? []) {
    if (task.tombstone) {
      skipped += 1;
      continue;
    }
    const { data: prefs } = await supabase
      .from("reminder_preferences")
      .select("email_opt_in, canvas_email_opt_in")
      .eq("user_id", task.user_id)
      .maybeSingle();

    if (task.source === "canvas" && !prefs?.canvas_email_opt_in) {
      skipped += 1;
      continue;
    }

    const { data: userData } = await supabase.auth.admin.getUserById(task.user_id);
    const email = userData?.user?.email;
    if (!email) {
      failed += 1;
      continue;
    }

    const fireAt = task.start_time as string;
    const key = providerKey(task.user_id, task.id, fireAt);
    const { data: existing } = await supabase
      .from("reminder_deliveries")
      .select("id, state")
      .eq("provider_key", key)
      .maybeSingle();
    if (existing?.state === "accepted") {
      skipped += 1;
      continue;
    }

    const { data: wh } = await supabase
      .from("user_working_hours")
      .select("timezone")
      .eq("user_id", task.user_id)
      .maybeSingle();

    const result = await sendTaskReminderEmail(
      email,
      task.title,
      new Date(fireAt),
      task.category || "task",
      wh?.timezone || "UTC",
      { idempotencyKey: key, kind: task.source === "canvas" ? "due" : "starts" },
    );

    if (result.success) {
      sent += 1;
      await supabase
        .from("scheduling_nodes")
        .update({ reminder_sent_at: now.toISOString() })
        .eq("id", task.id);
      try {
        await supabase.from("reminder_deliveries").insert({
          user_id: task.user_id,
          channel: "email",
          destination: email,
          provider_key: key,
          state: "accepted",
          accepted_at: now.toISOString(),
        });
      } catch {
        /* table may be missing until migration is applied */
      }
    } else {
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}
