import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { subDays } from "date-fns";
import type { TimeBlock } from "@/lib/rings/geometry";

export type BlockBoundaries = {
  morning: [number, number];
  afternoon: [number, number];
  evening: [number, number];
};

export const DEFAULT_BLOCK_BOUNDARIES: BlockBoundaries = {
  morning: [4, 12],
  afternoon: [12, 17],
  evening: [17, 4],
};

export type RingSettings = {
  timezone: string;
  day_start_hour: number;
  block_boundaries: BlockBoundaries;
  daily_task_estimate: number;
  rings_celebrated_on: string | null;
};

export const DEFAULT_RING_SETTINGS: RingSettings = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  day_start_hour: 4,
  block_boundaries: DEFAULT_BLOCK_BOUNDARIES,
  daily_task_estimate: 10,
  rings_celebrated_on: null,
};

function parseBoundaries(raw: unknown): BlockBoundaries {
  if (!raw || typeof raw !== "object") return DEFAULT_BLOCK_BOUNDARIES;
  const o = raw as Record<string, unknown>;
  const take = (key: keyof BlockBoundaries, fallback: [number, number]): [number, number] => {
    const v = o[key];
    if (Array.isArray(v) && v.length >= 2) {
      return [Number(v[0]) || fallback[0], Number(v[1]) || fallback[1]];
    }
    return fallback;
  };
  return {
    morning: take("morning", DEFAULT_BLOCK_BOUNDARIES.morning),
    afternoon: take("afternoon", DEFAULT_BLOCK_BOUNDARIES.afternoon),
    evening: take("evening", DEFAULT_BLOCK_BOUNDARIES.evening),
  };
}

export function normalizeRingSettings(row: Record<string, unknown> | null | undefined): RingSettings {
  if (!row) return { ...DEFAULT_RING_SETTINGS };
  return {
    timezone: String(row.timezone || DEFAULT_RING_SETTINGS.timezone),
    day_start_hour: Number(row.day_start_hour ?? 4),
    block_boundaries: parseBoundaries(row.block_boundaries),
    daily_task_estimate: Number(row.daily_task_estimate ?? 10),
    rings_celebrated_on: (row.rings_celebrated_on as string | null) ?? null,
  };
}

/** YYYY-MM-DD logical day for a UTC instant under user TZ + day_start_hour. */
export function logicalDate(
  completedAtUTC: Date | string,
  timezone: string,
  dayStartHour: number,
): string {
  const instant = typeof completedAtUTC === "string" ? new Date(completedAtUTC) : completedAtUTC;
  const local = toZonedTime(instant, timezone);
  const hour = local.getHours();
  const base = hour < dayStartHour ? subDays(local, 1) : local;
  return formatInTimeZone(base, timezone, "yyyy-MM-dd");
}

export function todayLogicalDate(settings: RingSettings, now = new Date()): string {
  return logicalDate(now, settings.timezone, settings.day_start_hour);
}

/**
 * Map a local hour to a block. Ranges are [start, end) except evening which
 * wraps past midnight until day_start.
 */
export function blockForLocalHour(
  hour: number,
  boundaries: BlockBoundaries = DEFAULT_BLOCK_BOUNDARIES,
): TimeBlock {
  const [mStart, mEnd] = boundaries.morning;
  const [aStart, aEnd] = boundaries.afternoon;
  if (hour >= mStart && hour < mEnd) return "morning";
  if (hour >= aStart && hour < aEnd) return "afternoon";
  return "evening";
}

export function currentTimeBlock(settings: RingSettings, now = new Date()): TimeBlock {
  const local = toZonedTime(now, settings.timezone);
  return blockForLocalHour(local.getHours(), settings.block_boundaries);
}

/** Classify a free-text hint into a block when AI/chrono gives a wall-clock hour. */
export function blockForClockHour(
  hour: number,
  settings: RingSettings,
): TimeBlock {
  return blockForLocalHour(hour, settings.block_boundaries);
}
