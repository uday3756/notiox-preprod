import type { SupabaseClient } from "@supabase/supabase-js";
import { completionCommand, type CompletionResult } from "./task-completion.types";
import { FEATURE_FLAGS } from "./feature-flags";
import { currentTimeBlock, logicalDate, normalizeRingSettings } from "./rings/day";

export class TaskCompletionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function commitTaskCompletion(
  userId: string,
  input: unknown,
  userClient: SupabaseClient,
): Promise<CompletionResult> {
  if (!FEATURE_FLAGS.workflow) throw new Error("Task workflow is not enabled.");
  const command = completionCommand.parse(input);
  const { data: hours, error: hoursError } = await userClient
    .from("user_working_hours")
    .select("timezone,day_start_hour,block_boundaries,daily_task_estimate")
    .eq("user_id", userId)
    .maybeSingle();
  if (hoursError) throw new Error("Couldn't read your day settings. Try again.");
  const settings = normalizeRingSettings(hours);
  const now = new Date();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Privileged RPC gets its actor only from verified middleware, never the request body.
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const { data, error } = await admin.rpc("notio_set_completion", {
    p_actor: userId,
    p_entity_id: command.entityId,
    p_desired: command.desiredState,
    p_revision: command.expectedRevision,
    p_action_id: command.actionId,
    p_source: command.source,
    p_award_xp: FEATURE_FLAGS.dolphinXp,
    p_logical_date: logicalDate(now, settings.timezone, settings.day_start_hour),
    p_time_block: currentTimeBlock(settings, now),
  });
  if (error) {
    if (error.message.includes("Task not found"))
      throw new TaskCompletionError("This task was removed. Refresh your tasks.", 404);
    if (error.message.includes("STALE_REVISION"))
      throw new TaskCompletionError(
        "This task changed on another device. Refresh and try again.",
        409,
      );
    if (error.message.includes("needs review") || error.message.includes("Invalid map link"))
      throw new TaskCompletionError("This task link needs review in NotioX.", 409);
    throw new TaskCompletionError("Couldn't update this task. Refresh and try again.", 503);
  }
  // Completion is already committed. Failed exports stay in the durable outbox.
  void flushCompletionExports(userId).catch(() => undefined);
  return data as CompletionResult;
}

/** Stop automatic retries after this many failures; user can still force retry. */
export const COMPLETION_EXPORT_MAX_ATTEMPTS = 8;

export async function flushCompletionExports(
  userId: string,
  options: { includeExhausted?: boolean } = {},
) {
  if (!FEATURE_FLAGS.googleCalendar) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const { data } = await admin
    .from("completion_export_outbox")
    .select("task_id,revision,attempts")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(20);
  if (!data?.length) return;
  const { pushTaskToGoogle } = await import("./google-calendar.sync.server");
  for (const row of data) {
    if (!options.includeExhausted && (row.attempts ?? 0) >= COMPLETION_EXPORT_MAX_ATTEMPTS) {
      continue;
    }
    try {
      const result = await pushTaskToGoogle(row.task_id);
      if (!result.ok) {
        await admin
          .from("completion_export_outbox")
          .update({ attempts: (row.attempts ?? 0) + 1 })
          .eq("user_id", userId)
          .eq("task_id", row.task_id)
          .eq("revision", row.revision);
        continue;
      }
      await admin
        .from("completion_export_outbox")
        .delete()
        .eq("user_id", userId)
        .eq("task_id", row.task_id)
        .eq("revision", row.revision);
    } catch {
      await admin
        .from("completion_export_outbox")
        .update({ attempts: (row.attempts ?? 0) + 1 })
        .eq("user_id", userId)
        .eq("task_id", row.task_id)
        .eq("revision", row.revision);
    }
  }
}

/** Cron/leased sweep: flush non-exhausted rows for every user with pending exports. */
export async function flushAllCompletionExports(limitUsers = 40) {
  if (!FEATURE_FLAGS.googleCalendar) return { users: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const { data } = await admin
    .from("completion_export_outbox")
    .select("user_id")
    .lt("attempts", COMPLETION_EXPORT_MAX_ATTEMPTS)
    .limit(limitUsers * 5);
  const userIds = [...new Set((data ?? []).map((r) => r.user_id as string))].slice(0, limitUsers);
  for (const userId of userIds) {
    await flushCompletionExports(userId);
  }
  return { users: userIds.length };
}
