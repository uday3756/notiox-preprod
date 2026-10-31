/**
 * Shared timezone picker options for account setup / working hours.
 * Includes AM/PM countries (US, CA, AU, NZ, PH) and common 24h regions.
 */
export const TIMEZONE_OPTIONS = [
  "UTC",
  // Americas
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  // Europe / Africa
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  // Middle East / Asia
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Asia/Manila",
  // Oceania
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "Pacific/Fiji",
] as const;

export type TimezoneOption = (typeof TIMEZONE_OPTIONS)[number];

/** Prefer browser zone when known; otherwise keep current. */
export function detectAccountTimezone(fallback = "UTC"): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    if (tz) return tz;
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Options for a select: curated list + detected zone if missing. */
export function timezoneSelectOptions(current?: string | null): string[] {
  const list = [...TIMEZONE_OPTIONS] as string[];
  const detected = detectAccountTimezone("");
  if (detected && !list.includes(detected)) list.unshift(detected);
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}
