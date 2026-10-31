import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { pullMyGoogleCalendar } from "@/lib/google-calendar.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { supabase } from "@/integrations/supabase/client";

const PULL_INTERVAL_MS = 5 * 60 * 1000; // every 5 min while app is open

/**
 * Pulls Google → Notio while the app is open.
 * Complements the daily Vercel cron (Hobby plan cannot poll every few minutes).
 *
 * Must be mounted under QueryClientProvider (not in RootComponent above it).
 */
export function useGoogleCalendarPull(enabled = FEATURE_FLAGS.googleCalendar) {
  const pullFn = useServerFn(pullMyGoogleCalendar);
  const qc = useQueryClient();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function pullOnce() {
      if (cancelled || inFlight.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      inFlight.current = true;
      try {
        const res = await pullFn();
        if (cancelled) return;
        if (res.ok && res.updated > 0) {
          qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
          qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
        }
      } catch {
        /* best-effort */
      } finally {
        inFlight.current = false;
      }
    }

    // First pull shortly after mount / login
    const kick = window.setTimeout(() => void pullOnce(), 2500);
    timer = setInterval(() => void pullOnce(), PULL_INTERVAL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void pullOnce();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearTimeout(kick);
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, pullFn, qc]);
}

/** Tiny mount point so the hook runs under QueryClientProvider. */
export function GoogleCalendarPullMount({ enabled = FEATURE_FLAGS.googleCalendar }: { enabled?: boolean }) {
  useGoogleCalendarPull(enabled);
  return null;
}
