/**
 * CR-02 §B — Lead-time reminders.
 *
 * A task can remind a chosen interval BEFORE its time (e.g. "1 hour before").
 * The offset is stored per-task; when unset, the task falls back to the user's
 * global notification interval settings (CR-01). No new table/column: the
 * per-task offset rides in the existing `scheduling_nodes.extracted_intent`
 * JSONB as `remind_offset_minutes` (no migration / no new infra).
 */

// Sentinel meaning "no per-task override — use the global interval settings".
export const USE_GLOBAL_OFFSET = null;

export type LeadOffset = number | null; // minutes before, or null = use global

/** Selectable per-task offsets (minutes before the task). */
export const OFFSET_OPTIONS: { label: string; minutes: number }[] = [
  { label: "At time", minutes: 0 },
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "1 day", minutes: 1440 },
];

/** Human label for a notification body, e.g. "In 1 hour" / "In 30 min" / "Now". */
export function leadLabel(minutes: number): string {
  if (minutes <= 0) return "Now";
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `In ${d} day${d > 1 ? "s" : ""}`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `In ${h} hour${h > 1 ? "s" : ""}`;
  }
  return `In ${minutes} min`;
}

/** Short label for the per-task chip, e.g. "1h before", "At time". */
export function offsetChipLabel(minutes: number): string {
  if (minutes <= 0) return "At time";
  const opt = OFFSET_OPTIONS.find((o) => o.minutes === minutes);
  return opt ? `${opt.label} before` : `${minutes}m before`;
}

/**
 * Tiny, no-LLM parser. Pulls an explicit lead time out of free text:
 *   "remind me an hour before"  → 60
 *   "30 min before"             → 30
 *   "2 days before"             → 2880
 * Returns null when the text says nothing about a lead time.
 */
export function parseLeadFromText(t: string): number | null {
  if (!t) return null;
  if (/\ban hour before\b/i.test(t)) return 60;
  if (/\bhalf an hour before\b/i.test(t)) return 30;
  const m = t.match(/(\d+)\s*(min|minute|hour|hr|day)s?\s+before\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase()[0]; // m | h | d
  return u === "h" ? n * 60 : u === "d" ? n * 1440 : n;
}

/** Read a stored per-task offset out of an extracted_intent JSONB blob. */
export function readOffset(extractedIntent: unknown): LeadOffset {
  if (!extractedIntent || typeof extractedIntent !== "object") return USE_GLOBAL_OFFSET;
  const v = (extractedIntent as Record<string, unknown>).remind_offset_minutes;
  return typeof v === "number" && v >= 0 ? v : USE_GLOBAL_OFFSET;
}
