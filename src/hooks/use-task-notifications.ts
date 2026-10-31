import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { areNotificationsEnabled, getNotificationIntervals } from "./use-notification-settings";
import { readOffset, leadLabel } from "@/lib/tasks/lead-time";
import { reminderOwnerKey, shouldBrowserNotifyTask } from "@/lib/task-identity";

const NOTIFIED_TASKS_KEY = "Notio.notified-tasks";

function ownerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("notio:owner");
  } catch {
    return null;
  }
}

function notifiedStorageKey(): string {
  return reminderOwnerKey(NOTIFIED_TASKS_KEY, ownerId());
}

/**
 * Show a notification in a way that works on EVERY platform.
 *
 * Android Chrome forbids the `new Notification()` constructor ("Failed to
 * construct 'Notification': Illegal constructor") and REQUIRES
 * ServiceWorkerRegistration.showNotification(). Desktop supports both. So we
 * prefer the service-worker path (works everywhere, incl. Android) and only fall
 * back to the constructor when no service worker is available.
 */
async function showAppNotification(
  title: string,
  options: NotificationOptions,
): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      // navigator.serviceWorker.ready NEVER rejects — if the SW failed to
      // register it just hangs forever, which would silently drop the
      // notification. Race it against a timeout so we always fall back.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
  } catch {
    /* fall through to the constructor below */
  }
  // Fallback: the plain constructor. Works on desktop; on Android it throws
  // ("Illegal constructor"), which we swallow — but there the SW path succeeds.
  try {
    new Notification(title, options);
  } catch {
    /* platform disallows notifications outside a service worker — give up */
  }
}

type NotifiedTask = {
  id: string;
  notifiedAt: number;
};

/**
 * Track which tasks we've already notified about (to avoid duplicates)
 */
function getNotifiedTasks(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(notifiedStorageKey());
    if (!raw) return new Map();
    const tasks = JSON.parse(raw) as NotifiedTask[];
    return new Map(tasks.map(t => [t.id, t.notifiedAt]));
  } catch {
    return new Map();
  }
}

function saveNotifiedTask(taskId: string) {
  if (typeof window === "undefined") return;
  const notified = getNotifiedTasks();
  notified.set(taskId, Date.now());
  
  // Keep only recent entries (last 24 hours) to avoid localStorage bloat
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = Array.from(notified.entries())
    .filter(([_, time]) => time > oneDayAgo)
    .map(([id, time]) => ({ id, notifiedAt: time }));
  
  window.localStorage.setItem(notifiedStorageKey(), JSON.stringify(recent));
}

/**
 * Check for tasks starting in the next minute and send notifications
 */
async function checkAndNotifyUpcomingTasks() {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || window.Notification.permission !== "granted") return;
  
  // Check if user has enabled notifications
  if (!areNotificationsEnabled()) return;

  try {
    const now = new Date();
    const globalIntervals = getNotificationIntervals();

    // A per-task override can be up to 1 day (1440 min). Fetch tasks far enough
    // ahead to cover both the global intervals and the largest possible
    // per-task lead time, then decide per task below.
    const maxMinutes = Math.max(...globalIntervals, 1440);
    const maxNotificationTime = new Date(now.getTime() + maxMinutes * 60 * 1000);

    // CR-02 §B — also pull extracted_intent so we can read a per-task
    // remind_offset_minutes override.
    const { data: tasks, error } = await supabase
      .from("scheduling_nodes")
      .select("id, title, start_time, extracted_intent, source")
      .eq("status", "pending")  // Only pending tasks (not completed/cancelled)
      .eq("is_timebound", true)  // CR-01 §2: only tasks with a spoken time fire an alarm; no-time tasks are list-only
      .gte("start_time", now.toISOString())  // Task must start from NOW onwards (excludes past)
      .lte("start_time", maxNotificationTime.toISOString());  // within the look-ahead window

    if (error) {
      console.error("[task-notifications] Error fetching tasks:", error);
      return;
    }

    if (!tasks || tasks.length === 0) return;

    const notified = getNotifiedTasks();

    for (const task of tasks) {
      if (!shouldBrowserNotifyTask((task as { source?: string | null }).source)) continue;
      const taskStart = new Date(task.start_time).getTime();
      const minutesUntilTask = (taskStart - now.getTime()) / (60 * 1000);

      // CR-02 §B — effective lead offsets for THIS task:
      //   per-task override (single offset) wins; otherwise the global intervals.
      const override = readOffset(task.extracted_intent);
      const offsets = override !== null ? [override] : globalIntervals;

      for (const offset of offsets) {
        const notificationKey = `task-${task.id}-${offset}m`;

        // Fire once we've entered the lead window (minutesUntilTask <= offset).
        // Using "<=" rather than an exact 1-min slot means a 30s polling gap can
        // never make us skip a reminder, and a task created already inside its
        // lead window (e.g. due in 20 min with a 60-min offset) still fires
        // promptly — the CR's clamp. Dedup by (task, offset) keeps it to once.
        if (minutesUntilTask <= offset && !notified.has(notificationKey)) {
          await showAppNotification(task.title, {
            body: leadLabel(Math.max(0, Math.round(minutesUntilTask))),
            icon: "/logo.png",
            badge: "/logo.png",
            tag: notificationKey,
            requireInteraction: true,
          });
          saveNotifiedTask(notificationKey);
        }
      }
    }
  } catch (err) {
    console.error("[task-notifications] Error in checkAndNotifyUpcomingTasks:", err);
  }
}

/**
 * Hook: Monitor for upcoming tasks and send notifications 1 minute before
 * Mount once at the app root (e.g., in __root.tsx)
 */
export function useTaskNotifications() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check immediately, then every 30 seconds
    checkAndNotifyUpcomingTasks();
    const interval = setInterval(() => {
      checkAndNotifyUpcomingTasks();
    }, 30 * 1000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);
}

/**
 * Request browser notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (
    window.Notification.permission === "granted" ||
    window.Notification.permission === "denied"
  ) {
    return window.Notification.permission;
  }
  return await window.Notification.requestPermission();
}

/**
 * CR-01 §5 — Test notification. Fires a banner ~5s later so a user can verify
 * the notification pipeline works on their device/browser. Web caveat: unlike
 * native, browser notifications only fire while the tab/PWA is open (JS doesn't
 * run when fully closed), so this verifies the in-session path.
 */
export async function fireTestNotification(): Promise<boolean> {
  const perm = await requestNotificationPermission();
  if (perm !== "granted") return false;
  setTimeout(() => {
    void showAppNotification("Notio test", {
      body: "If this arrived ~5s after tapping, notifications work.",
      icon: "/logo.png",
      badge: "/logo.png",
      tag: "notio-test",
    });
  }, 5000);
  return true;
}
