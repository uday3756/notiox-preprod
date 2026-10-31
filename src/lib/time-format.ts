/**
 * Clock display style from the user's account timezone (proxy for country).
 *
 * 12-hour AM/PM for: USA, Australia, New Zealand, Canada, Philippines.
 * 24-hour elsewhere (India, most of Europe/Asia, etc.).
 */
import { formatInTimeZone } from "date-fns-tz";

/** Explicit IANA zones for AM/PM countries (plus common variants). */
const AMPM_EXACT_ZONES = new Set([
  // Philippines
  "Asia/Manila",
  // New Zealand
  "Pacific/Auckland",
  "Pacific/Chatham",
  // United States (common)
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Adak",
  "America/Honolulu",
  "Pacific/Honolulu",
  "America/Detroit",
  "America/Boise",
  "America/Indiana/Indianapolis",
  "America/Kentucky/Louisville",
  "America/Nome",
  "America/Sitka",
  "America/Juneau",
  "US/Eastern",
  "US/Central",
  "US/Mountain",
  "US/Pacific",
  "US/Alaska",
  "US/Hawaii",
  // Canada
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "America/Regina",
  "America/Montreal",
  "America/Iqaluit",
  "America/Whitehorse",
  "Canada/Eastern",
  "Canada/Central",
  "Canada/Mountain",
  "Canada/Pacific",
  "Canada/Atlantic",
  "Canada/Newfoundland",
]);

/** Latin America / Caribbean America/* zones that prefer 24h — not AM/PM countries above. */
const AMERICA_24H_PREFIXES = [
  "America/Argentina/",
  "America/Sao_Paulo",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Mexico_City",
  "America/Cancun",
  "America/Monterrey",
  "America/Tijuana",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Caracas",
  "America/La_Paz",
  "America/Asuncion",
  "America/Montevideo",
  "America/Guayaquil",
  "America/Havana",
  "America/Costa_Rica",
  "America/Panama",
  "America/Guatemala",
  "America/El_Salvador",
  "America/Managua",
  "America/Tegucigalpa",
  "America/Jamaica",
  "America/Santo_Domingo",
  "America/Barbados",
];

function isLatinAmerica24h(tz: string): boolean {
  return AMERICA_24H_PREFIXES.some((p) => tz === p || tz.startsWith(p));
}

/**
 * True when this account timezone should display / prefer spoken AM/PM.
 * Derived from working-hours timezone (set when the user creates their account).
 */
export function usesAmPmClock(timezone: string | null | undefined): boolean {
  const tz = (timezone || "").trim();
  if (!tz || tz === "UTC") return false;

  if (AMPM_EXACT_ZONES.has(tz)) return true;

  // All Australian zones
  if (tz.startsWith("Australia/")) return true;

  // US legacy / Pacific territories often used with US accounts
  if (tz.startsWith("US/")) return true;
  if (tz.startsWith("Canada/")) return true;

  // Remaining America/* → treat as US/Canada AM/PM unless Latin America
  if (tz.startsWith("America/") && !isLatinAmerica24h(tz)) return true;

  return false;
}

/** date-fns-tz pattern for clock time in the user's country style. */
export function clockPattern(timezone: string | null | undefined): string {
  return usesAmPmClock(timezone) ? "h:mm a" : "HH:mm";
}

/** Format an instant as local wall-clock in the account timezone. */
export function formatClockInZone(
  isoOrDate: string | Date,
  timezone: string | null | undefined,
): string {
  const tz = (timezone || "UTC").trim() || "UTC";
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return formatInTimeZone(d, tz, clockPattern(tz));
}

/**
 * Format a stored "HH:mm" / "HH:mm:ss" working-hours string for display.
 * Uses AM/PM only for AM/PM countries.
 */
export function formatWorkingHoursClock(
  hhmm: string,
  timezone: string | null | undefined,
): string {
  const [hRaw, mRaw = "00"] = hhmm.split(":");
  const hour = Number(hRaw);
  const minute = (mRaw || "00").slice(0, 2);
  if (!Number.isFinite(hour)) return hhmm;

  if (!usesAmPmClock(timezone)) {
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${period}`;
}

/** Options for Date#toLocaleString matching the account clock style. */
export function localeTimeOptions(
  timezone: string | null | undefined,
): Intl.DateTimeFormatOptions {
  const hour12 = usesAmPmClock(timezone);
  return {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
    timeZone: (timezone || "UTC").trim() || "UTC",
  };
}
