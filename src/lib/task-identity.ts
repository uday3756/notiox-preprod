/** Pure task-identity helpers. Safe for unit tests — no I/O. */

export type TaskSource = "voice" | "capture" | "journal" | "manual" | "canvas" | "google" | string | null | undefined;

export function isCanvasSource(source: TaskSource): boolean {
  return source === "canvas";
}

/** Title+start legacy upsert must never merge onto a Canvas row. */
export function voiceUpsertShouldSkip(existingSource: TaskSource): boolean {
  return isCanvasSource(existingSource);
}

/** Google pull may change planned time only for Canvas-owned rows. */
export function googlePullAllowedFields(source: TaskSource): ReadonlyArray<string> {
  if (isCanvasSource(source)) {
    return ["google_event_id", "start_time", "end_time", "is_timebound", "updated_at"];
  }
  return ["google_event_id", "start_time", "end_time", "is_timebound", "updated_at", "title"];
}

export function reminderOwnerKey(base: string, userId: string | null | undefined): string {
  return userId ? `${base}:${userId}` : `${base}:anon`;
}

export function shouldBrowserNotifyTask(source: TaskSource): boolean {
  return !isCanvasSource(source);
}

export type ReminderKind = "starts" | "due";

export function reminderCopyKind(opts: { dueAt?: string | null; startTime?: string | null; source?: TaskSource }): ReminderKind {
  if (isCanvasSource(opts.source) && opts.dueAt) return "due";
  return "starts";
}
