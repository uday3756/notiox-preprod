import { useEffect } from "react";

import { reminderOwnerKey } from "@/lib/task-identity";

const STORAGE_KEY = "Notio.reminder";

function reminderKey(): string {
  let owner: string | null = null;
  try {
    owner = sessionStorage.getItem("notio:owner");
  } catch {
    owner = null;
  }
  return reminderOwnerKey(STORAGE_KEY, owner);
}

type ReminderConfig = {
  enabled: boolean;
  intervalMinutes: number; // 0 = off
  message: string;
};

export function getReminderConfig(): ReminderConfig {
  if (typeof window === "undefined") {
    return { enabled: false, intervalMinutes: 0, message: "" };
  }
  try {
    const raw = window.localStorage.getItem(reminderKey());
    if (!raw) return { enabled: false, intervalMinutes: 60, message: "Time to capture a thought  " };
    return JSON.parse(raw) as ReminderConfig;
  } catch {
    return { enabled: false, intervalMinutes: 60, message: "Time to capture a thought  " };
  }
}

export function saveReminderConfig(cfg: ReminderConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(reminderKey(), JSON.stringify(cfg));
  window.dispatchEvent(new Event("Notio:reminder-updated"));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

/** Mount once at the app root. Fires a Notification every N minutes if enabled. */
export function useReminders() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;

    function fire() {
      const cfg = getReminderConfig();
      if (!cfg.enabled || cfg.intervalMinutes <= 0) return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        new Notification("Notio", { body: cfg.message || "Capture a thought." });
      } catch {
        /* ignore - some platforms throw outside SW */
      }
    }

    function setup() {
      if (timer) clearInterval(timer);
      const cfg = getReminderConfig();
      if (cfg.enabled && cfg.intervalMinutes > 0) {
        timer = setInterval(fire, cfg.intervalMinutes * 60 * 1000);
      }
    }

    setup();
    window.addEventListener("Notio:reminder-updated", setup);
    return () => {
      window.removeEventListener("Notio:reminder-updated", setup);
      if (timer) clearInterval(timer);
    };
  }, []);
}
