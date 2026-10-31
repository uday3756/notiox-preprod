/**
 * ISO week helpers shared by client and server code (no ".server" suffix so
 * route components can import it directly).
 *
 * ef_scores.week_start is always a Monday (handoff §7 data contract), but
 * weekly_reports.week_start is a rolling window ending on the user's chosen
 * report day — the two almost never share the same date. To match a report
 * row to its EF score we compare ISO weeks, not exact dates.
 */

/** Monday 00:00 UTC of the ISO week containing `input`. */
export function mondayOf(input: Date | string): Date {
  const d = new Date(input);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** yyyy-mm-dd of the Monday for `input` — directly comparable to ef_scores.week_start. */
export function mondayKeyOf(input: Date | string): string {
  return mondayOf(input).toISOString().slice(0, 10);
}
