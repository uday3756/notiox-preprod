/**
 * Manage user notification preferences (persisted to localStorage)
 * Includes toggle and multiple notification intervals (user can select multiple times)
 */

import { reminderOwnerKey } from "@/lib/task-identity";

const NOTIFICATION_SETTINGS_KEY = "Notio.notification-settings";

function ownerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("notio:owner");
  } catch {
    return null;
  }
}

function settingsKey(): string {
  return reminderOwnerKey(NOTIFICATION_SETTINGS_KEY, ownerId());
}

export type NotificationSettings = {
  enabled: boolean;
  intervals: number[]; // Multiple intervals: [1, 10, 30, 60] means notify at 1m, 10m, 30m, 1h before
  lastUpdated: number;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  intervals: [1], // Default to 1 minute before
  lastUpdated: 0,
};

/**
 * Normalize any stored value into a valid NotificationSettings.
 *
 * Older builds persisted a different shape (e.g. `{ enabled, minutesBefore }`
 * with no `intervals` array). Reading that raw caused `intervals` to be
 * undefined, which then crashed the Profile page at render
 * (`notificationIntervals.includes(...)` on undefined). This migrates any
 * legacy/partial/corrupt value to the current shape so callers always get a
 * non-empty number[] for `intervals`.
 */
function normalizeSettings(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const v = raw as Record<string, unknown>;

  let intervals: number[] = [];
  if (Array.isArray(v.intervals)) {
    intervals = v.intervals.filter((n): n is number => typeof n === "number" && n > 0);
  } else if (typeof v.minutesBefore === "number" && v.minutesBefore > 0) {
    // Legacy single-interval format → upgrade to the array shape.
    intervals = [v.minutesBefore];
  }
  if (intervals.length === 0) intervals = [...DEFAULT_SETTINGS.intervals];

  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : false,
    intervals: Array.from(new Set(intervals)).sort((a, b) => a - b),
    lastUpdated: typeof v.lastUpdated === "number" ? v.lastUpdated : 0,
  };
}

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(settingsKey());
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveNotificationSettings(settings: Partial<NotificationSettings>) {
  if (typeof window === "undefined") return;
  const current = getNotificationSettings();
  const updated: NotificationSettings = {
    ...current,
    ...settings,
    lastUpdated: Date.now(),
  };
  window.localStorage.setItem(settingsKey(), JSON.stringify(updated));
}

export function enableNotifications(intervals?: number[]) {
  saveNotificationSettings({
    enabled: true,
    intervals: intervals ?? [1],
  });
}

export function disableNotifications() {
  saveNotificationSettings({ enabled: false });
}

export function toggleNotificationInterval(minutes: number) {
  const current = getNotificationSettings();
  const intervals = current.intervals.includes(minutes)
    ? current.intervals.filter(m => m !== minutes)
    : [...current.intervals, minutes].sort((a, b) => a - b);

  // If no intervals left, disable notifications
  if (intervals.length === 0) {
    disableNotifications();
  } else {
    saveNotificationSettings({
      enabled: current.enabled,
      intervals,
    });
  }
}

export function setNotificationIntervals(intervals: number[]) {
  const sorted = intervals.length > 0 ? intervals.sort((a, b) => a - b) : [1];
  saveNotificationSettings({
    enabled: intervals.length > 0,
    intervals: sorted,
  });
}

export function areNotificationsEnabled(): boolean {
  return getNotificationSettings().enabled;
}

export function getNotificationIntervals(): number[] {
  return getNotificationSettings().intervals;
}

export const NOTIFICATION_INTERVALS = [1, 10, 20, 30, 60] as const;
