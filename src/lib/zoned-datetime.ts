/**
 * Worldwide timezone helpers: naive local ↔ UTC, datetime-local ↔ account TZ.
 * Always pass an IANA zone (e.g. America/New_York, Asia/Kolkata, Europe/Berlin).
 */
import { parse, isValid } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Current wall-clock in the user's zone — correct offset for Claude prompts. */
export function formatNowInTimezone(
  instant: Date | string,
  userTimezone: string,
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return formatInTimeZone(d, userTimezone, "yyyy-MM-dd HH:mm:ss XXX");
}

/**
 * Treat AI/user wall-clock as local in `userTimezone`, return UTC ISO.
 * Strips accidental Z / offsets so "3pm" never becomes 15:00 UTC by accident.
 */
export function normalizeNaiveLocalToUtc(
  isoString: string | null | undefined,
  userTimezone: string,
): string | null {
  if (!isoString) return null;

  try {
    let normalized = isoString
      .trim()
      .replace(/Z$/i, "")
      // +05:30, +0530, +05:30:00, -0800, etc.
      .replace(/[+-]\d{2}:?\d{2}(?::\d{2})?$/, "")
      .replace(/\.\d{1,9}$/, "");

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
      normalized += ":00";
    }

    let localDate = parse(normalized, "yyyy-MM-dd'T'HH:mm:ss", new Date());
    if (!isValid(localDate)) {
      localDate = parse(normalized, "yyyy-MM-dd HH:mm:ss", new Date());
    }
    if (!isValid(localDate)) {
      console.error(
        "[normalizeNaiveLocalToUtc] Unparseable:",
        isoString,
        "→",
        normalized,
      );
      return null;
    }

    return fromZonedTime(localDate, userTimezone).toISOString();
  } catch (err) {
    console.error(
      "[normalizeNaiveLocalToUtc] Failed:",
      isoString,
      userTimezone,
      err,
    );
    return null;
  }
}

/** ISO instant → value for `<input type="datetime-local">` in account TZ. */
export function toDatetimeLocalValue(iso: string, userTimezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatInTimeZone(d, userTimezone, "yyyy-MM-dd'T'HH:mm");
}

/** datetime-local string in account TZ → UTC ISO. */
export function fromDatetimeLocalValue(
  local: string,
  userTimezone: string,
): string {
  const normalized =
    local.length === 16 ? `${local}:00` : local.length === 19 ? local : `${local}:00`;
  return fromZonedTime(normalized, userTimezone).toISOString();
}

/** Civil yyyy-MM-dd for an instant in the user's zone. */
export function ymdInTimezone(instant: Date | string, userTimezone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return formatInTimeZone(d, userTimezone, "yyyy-MM-dd");
}

/** Tomorrow's civil date in the user's zone. */
export function tomorrowYmdInTimezone(
  instant: Date,
  userTimezone: string,
): string {
  const today = ymdInTimezone(instant, userTimezone);
  const noonUtc = fromZonedTime(`${today}T12:00:00`, userTimezone);
  return ymdInTimezone(new Date(noonUtc.getTime() + 24 * 60 * 60 * 1000), userTimezone);
}
