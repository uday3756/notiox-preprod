/**
 * Feature 1 — End-of-Day "3 Wins" reminder hook.
 *
 * Fires a local browser Notification at the user's configured wind-down time
 * (default 21:00 local) so they remember to do the 3-wins ritual. Same web
 * pattern as use-task-notifications.ts — browser notifications only fire while
 * the tab/PWA is open, which is the existing documented limitation.
 *
 * Suppression rules from the spec:
 *   - Skip if the user already completed the 3-wins flow today (>=1 win row
 *     for today's local date).
 *   - Skip if there's zero activity today (no completed scheduling_nodes today
 *     AND no journal_entries today AND no maps created today). Opening to an
 *     empty sheet feels like failure — skip silently instead.
 *
 * Re-evaluates every 60s so timezone / wind-down changes take effect without a
 * reload, and reschedules when the user crosses their wind-down minute.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { reminderOwnerKey } from "@/lib/task-identity";

const NOTIFIED_KEY = "Notio.wins-notified-date";

function winsKey(): string {
  let owner: string | null = null;
  try {
    owner = sessionStorage.getItem("notio:owner");
  } catch {
    owner = null;
  }
  return reminderOwnerKey(NOTIFIED_KEY, owner);
}

function todayLocalDate(): string {
  // YYYY-MM-DD in the browser's local timezone — matches how the sheet stores
  // wins (the user's "today" is wherever they physically are).
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLastNotifiedDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(winsKey());
  } catch {
    return null;
  }
}

function setLastNotifiedDate(date: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(winsKey(), date);
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Fetch the user's wind-down time + whether they already completed today.
 * Returns null if wind-down isn't configured (use default 21:00).
 */
async function getWindDownConfig(): Promise<{ hour: number; minute: number } | null> {
  try {
    const { data } = await supabase
      .from("user_working_hours")
      .select("wind_down_hour, wind_down_minute")
      .maybeSingle();
    if (data && typeof data.wind_down_hour === "number") {
      return { hour: data.wind_down_hour, minute: data.wind_down_minute ?? 0 };
    }
  } catch {
    /* ignore — fall through to default */
  }
  return null;
}

async function hasCompletedToday(): Promise<boolean> {
  const today = todayLocalDate();
  const { count } = await supabase
    .from("daily_wins")
    .select("id", { count: "exact", head: true })
    .eq("local_date", today);
  return (count ?? 0) > 0;
}

async function hasActivityToday(): Promise<boolean> {
  const startIso = new Date();
  startIso.setHours(0, 0, 0, 0);
  const endIso = new Date();
  endIso.setHours(23, 59, 59, 999);

  // Any of: completed scheduling_nodes, journal_entries, or maps created today.
  const [tasks, entries, maps] = await Promise.all([
    supabase
      .from("scheduling_nodes")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", startIso.toISOString())
      .lte("completed_at", endIso.toISOString()),
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso.toISOString())
      .lte("created_at", endIso.toISOString()),
    supabase
      .from("maps")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso.toISOString())
      .lte("created_at", endIso.toISOString()),
  ]);
  return (
    (tasks.count ?? 0) > 0 || (entries.count ?? 0) > 0 || (maps.count ?? 0) > 0
  );
}

async function checkAndFire() {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || window.Notification.permission !== "granted") return;

  const now = new Date();
  const cfg = (await getWindDownConfig()) ?? { hour: 21, minute: 0 };

  // Have we hit/passed today's wind-down time?
  const windDown = new Date(now);
  windDown.setHours(cfg.hour, cfg.minute, 0, 0);
  if (now.getTime() < windDown.getTime()) return;

  // Already notified today — don't double-fire.
  if (getLastNotifiedDate() === todayLocalDate()) return;

  // Already completed the ritual today — suppress.
  if (await hasCompletedToday()) {
    setLastNotifiedDate(todayLocalDate()); // mark so we don't keep checking
    return;
  }

  // Zero activity today — suppress silently (spec: don't open to empty).
  if (!(await hasActivityToday())) {
    setLastNotifiedDate(todayLocalDate());
    return;
  }

  try {
    new Notification("Notio — 3 wins", {
      body: "Take 20 seconds to mark today's wins.",
      icon: "/logo.png",
      badge: "/logo.png",
      tag: "notio-wins",
      requireInteraction: false,
    });
    setLastNotifiedDate(todayLocalDate());
  } catch {
    /* some platforms throw outside a service worker; ignore */
  }
}

/**
 * Mount once at the app root (alongside useTaskNotifications).
 *
 * `enabled` gates the entire hook — when false (FEATURE_DAILY_WINS off), no
 * interval is scheduled and no notifications fire. Lets production keep the
 * incomplete feature disabled without unmounting the component.
 */
export function useWinsReminder(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    void checkAndFire();
    const interval = setInterval(() => void checkAndFire(), 60 * 1000);
    return () => clearInterval(interval);
  }, [enabled]);
}
