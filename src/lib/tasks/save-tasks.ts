/**
 * CR-01 §2/§3 — Glue called right after a capture or journal save.
 *
 * Runs detectTasks() on the saved text and persists any dated tasks. Per the
 * web-app decision we reuse the existing `scheduling_nodes` table (which the
 * notification poller already watches) instead of a new `tasks` table, so a
 * detected task shows up in the list AND fires a reminder with zero extra
 * wiring.
 *
 * Provenance (source / source_ref) is stored inside the existing
 * `extracted_intent` JSONB column so we don't need a schema change.
 */
import { supabase } from "@/integrations/supabase/client";
import { detectTasks, type DetectedTask } from "./detect-tasks";
import { parseLeadFromText } from "./lead-time";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { syncTaskToGoogleCalendar } from "@/lib/google-calendar.functions";
import { voiceUpsertShouldSkip } from "@/lib/task-identity";

export type TaskSource = "capture" | "journal" | "manual";

// Sensible all-day reminder hour for tasks with no spoken time (CR §2 note):
// the row gets a time so it sorts and groups correctly, but no alarm fires.
const DEFAULT_REMINDER_HOUR = 9;

function normalizedDueAt(t: DetectedTask): Date {
  if (t.hasTime) return t.dueAt;
  // No clock time spoken → pin to a sensible hour so it lands in the right
  // day bucket without implying an exact alarm time.
  const d = new Date(t.dueAt);
  d.setHours(DEFAULT_REMINDER_HOUR, 0, 0, 0);
  return d;
}

/**
 * Detect + save dated tasks from a block of text.
 * Returns the number of tasks created (0 when no date was found).
 */
export async function extractAndSaveTasks(
  text: string,
  source: TaskSource,
  sourceRef?: string | null,
): Promise<number> {
  const detected = detectTasks(text);
  if (detected.length === 0) return 0; // no date → nothing happens, as before

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 0;

  // CR-02 §B — if the text explicitly says "remind me X before", use that as the
  // per-task lead offset. Otherwise leave it unset so the task falls back to the
  // user's global notification interval settings.
  const textOffset = parseLeadFromText(text);

  let created = 0;
  for (const t of detected) {
    const dueAt = normalizedDueAt(t);

    // Dedup guard: skip if an identical pending task (same title + start time)
    // already exists — avoids doubles when the same dump is re-saved or when
    // the map's LLM extractor already captured the same item.
    const { data: existing } = await supabase
      .from("scheduling_nodes")
      .select("id, source")
      .eq("title", t.title)
      .eq("start_time", dueAt.toISOString())
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      if (voiceUpsertShouldSkip(existing.source)) continue;
      continue;
    }

    const row: Record<string, unknown> = {
      user_id: u.user.id,
      title: t.title,
      start_time: dueAt.toISOString(),
      is_timebound: t.hasTime, // true → eligible for a reminder; false → list only
      status: "pending",
      category: "task",
      source,
      priority: 3,
      original_transcript: text,
      extracted_intent: {
        source,
        source_ref: sourceRef ?? null,
        detected_by: "chrono",
        has_time: t.hasTime,
        // Only set when the text named a lead time; absent = use global settings.
        ...(textOffset !== null ? { remind_offset_minutes: textOffset } : {}),
      },
    };
    let inserted: { id: string } | null = null;
    const first = await supabase.from("scheduling_nodes").insert(row).select("id").maybeSingle();
    let error = first.error;
    inserted = first.data;
    if (error && /source/i.test(error.message)) {
      delete row.source;
      const retry = await supabase.from("scheduling_nodes").insert(row).select("id").maybeSingle();
      error = retry.error;
      inserted = retry.data;
    }
    if (!error && inserted?.id) {
      created += 1;
      // Fire-and-forget Google Calendar push for timed tasks.
      if (FEATURE_FLAGS.googleCalendar && t.hasTime) {
        syncTaskToGoogleCalendar({ data: { taskId: inserted.id } }).catch(() => undefined);
      }
    }
  }

  return created;
}
