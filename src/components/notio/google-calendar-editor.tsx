import { useEffect, useState } from "react";
import { Loader2, Unlink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disconnectGoogleCalendar,
  getGoogleCalendarConnectUrl,
  getGoogleCalendarStatus,
  listGoogleCalendars,
  pullMyGoogleCalendar,
  updateGoogleCalendarSettings,
} from "@/lib/google-calendar.functions";
import {
  getCompletionExportStatus,
  retryCompletionExports,
} from "@/lib/task-completion.functions";
import { GoogleCalendarIcon } from "@/components/notio/google-calendar-icon";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

/**
 * Profile: Connect Google Calendar (separate from Sign in with Google).
 * Gated by FEATURE_FLAGS.googleCalendar.
 */
export function GoogleCalendarEditor() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getGoogleCalendarStatus);
  const connectUrlFn = useServerFn(getGoogleCalendarConnectUrl);
  const disconnectFn = useServerFn(disconnectGoogleCalendar);
  const updateFn = useServerFn(updateGoogleCalendarSettings);
  const listFn = useServerFn(listGoogleCalendars);
  const pullFn = useServerFn(pullMyGoogleCalendar);
  const exportStatusFn = useServerFn(getCompletionExportStatus);
  const retryExportFn = useServerFn(retryCompletionExports);

  const [busy, setBusy] = useState(false);
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary?: boolean }[]>(
    [],
  );

  const { data: status, isLoading } = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => statusFn(),
    enabled: FEATURE_FLAGS.googleCalendar,
  });
  const exportStatus = useQuery({
    queryKey: ["completion-export-status"],
    queryFn: () => exportStatusFn(),
    enabled: FEATURE_FLAGS.googleCalendar && !!status?.connected,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (!gcal) return;
    if (gcal === "connected") {
      toast.success("Google Calendar connected");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    } else if (gcal === "error") {
      toast.error(params.get("reason") || "Could not connect Google Calendar");
    }
    params.delete("gcal");
    params.delete("reason");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [qc]);

  useEffect(() => {
    if (!status?.connected) {
      setCalendars([]);
      return;
    }
    listFn()
      .then((items) => setCalendars(items || []))
      .catch(() => setCalendars([]));
  }, [status?.connected, listFn]);

  // Pull Google → Notio when opening Profile with sync on (silent; use Sync now for feedback)
  useEffect(() => {
    if (!status?.connected || !status.syncEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await pullFn();
        if (cancelled || !res.ok) return;
        qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
        if (res.updated > 0) {
          qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status?.connected, status?.syncEnabled, pullFn, qc]);

  if (!FEATURE_FLAGS.googleCalendar) return null;

  async function connect() {
    setBusy(true);
    try {
      const { url } = await connectUrlFn();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Google connect");
      setBusy(false);
    }
  }

  async function disconnect(removeSyncedEvents: boolean) {
    setBusy(true);
    try {
      await disconnectFn({ data: { removeSyncedEvents } });
      toast.success("Google Calendar disconnected");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      setCalendars([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSync(on: boolean) {
    try {
      await updateFn({ data: { syncEnabled: on } });
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      toast.success(on ? "Sync on" : "Sync paused");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sync");
    }
  }

  async function pickCalendar(calendarId: string) {
    try {
      await updateFn({ data: { calendarId } });
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      toast.success("Calendar updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update calendar");
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const res = await pullFn();
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      if (!res.ok) {
        toast.error(res.reason === "disabled" ? "Calendar sync is disabled" : "Sync failed");
        return;
      }
      toast.success(
        res.updated === 0
          ? "Already up to date"
          : res.updated === 1
            ? "1 change pulled from Google"
            : `${res.updated} changes pulled from Google`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/5">
          <GoogleCalendarIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold">Google Calendar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Timed Notio tasks appear on your Google Calendar. Edits and completes sync both ways for
            events Notio created.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !status?.configured ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Calendar sync is not configured on this server yet (missing Google OAuth credentials).
        </p>
      ) : !status.connected ? (
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/15 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleCalendarIcon className="h-4 w-4" />
          )}
          Connect Google Calendar
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Sync timed tasks</p>
            <button
              type="button"
              onClick={() => toggleSync(!status.syncEnabled)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                status.syncEnabled
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {status.syncEnabled ? "On" : "Off"}
            </button>
          </div>

          {calendars.length > 0 && (
            <label className="block text-xs text-muted-foreground">
              Calendar
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={status.calendarId || "primary"}
                onChange={(e) => pickCalendar(e.target.value)}
              >
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                    {c.primary ? " (primary)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {status.lastSyncAt && (
            <p className="text-[11px] text-muted-foreground/70">
              Last sync {new Date(status.lastSyncAt).toLocaleString()}
            </p>
          )}

          {status.syncEnabled && (
            <button
              type="button"
              onClick={syncNow}
              disabled={busy}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary/15 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </button>
          )}

          {(exportStatus.data?.pending ?? 0) > 0 && (
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="break-words text-xs text-muted-foreground">
                {exportStatus.data?.exhausted
                  ? `${exportStatus.data.exhausted} completion export(s) need a manual retry after repeated failures.`
                  : `${exportStatus.data?.pending} completion export(s) waiting to reach Google.`}
              </p>
              <button
                type="button"
                disabled={busy}
                className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
                onClick={() => {
                  setBusy(true);
                  void retryExportFn()
                    .then((res) => {
                      void qc.invalidateQueries({ queryKey: ["completion-export-status"] });
                      toast.success(
                        res.remaining === 0
                          ? "Exports cleared"
                          : `${res.remaining} still pending — will retry in the background`,
                      );
                    })
                    .catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Retry failed"),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Retry failed exports
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => disconnect(false)}
            disabled={busy}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            Disconnect
          </button>
          <button
            type="button"
            onClick={() => disconnect(true)}
            disabled={busy}
            className="w-full text-center text-[11px] text-muted-foreground/70 underline-offset-2 hover:underline"
          >
            Disconnect and remove synced Google events
          </button>
        </div>
      )}
    </div>
  );
}
