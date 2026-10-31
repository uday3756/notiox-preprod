import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { useSupabaseAuth } from "@/hooks/use-auth";
import {
  claimTaskNudge,
  respondTaskNudge,
  getNudgePreferences,
  saveNudgePreferences,
} from "@/lib/task-nudges.functions";

export function ActionableNudge() {
  const { userId } = useSupabaseAuth(),
    claim = useServerFn(claimTaskNudge),
    respond = useServerFn(respondTaskNudge),
    qc = useQueryClient(),
    navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname }),
    [busy, setBusy] = useState(false);
  const nudge = useQuery({
    queryKey: ["task-nudge", userId],
    queryFn: () => claim(),
    enabled: !!userId && pathname !== "/capture",
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  async function answer(action: "started" | "snoozed" | "not_today" | "dismissed") {
    if (!nudge.data) return;
    setBusy(true);
    try {
      await respond({ data: { id: nudge.data.id, action } });
      const task = nudge.data.taskId;
      qc.setQueryData(["task-nudge", userId], null);
      if (action === "started") navigate({ to: "/assignments/$id", params: { id: task } });
    } catch {
      toast.error("Couldn't update reminder. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {nudge.data && pathname !== "/capture" && (
        <aside
          className="mx-auto max-w-3xl border-b border-border px-5 py-4"
          aria-label="Next-step reminder"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 break-words text-sm font-medium">
              {nudge.data.title}
              {nudge.data.estimate ? ` · ${nudge.data.estimate} min` : ""}
            </p>
            <button
              disabled={busy}
              onClick={() => void answer("dismissed")}
              aria-label="Dismiss reminder"
              className="flex h-11 w-11 shrink-0 items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <button
              disabled={busy}
              onClick={() => void answer("started")}
              className="inline-flex min-h-11 items-center gap-2"
            >
              <ArrowRight size={16} />
              Start now
            </button>
            <button
              disabled={busy}
              onClick={() => void answer("snoozed")}
              className="inline-flex min-h-11 items-center gap-2"
            >
              <Clock size={16} />
              Snooze
            </button>
            <button disabled={busy} onClick={() => void answer("not_today")} className="min-h-11">
              Not today
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

export function NudgeSettings() {
  const { userId } = useSupabaseAuth(),
    load = useServerFn(getNudgePreferences),
    save = useServerFn(saveNudgePreferences),
    qc = useQueryClient(),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["nudge-preferences", userId],
    queryFn: () => load(),
    enabled: !!userId,
  });
  async function update(enabled: boolean) {
    setBusy(true);
    try {
      await save({
        data: { enabled, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
      });
      await qc.invalidateQueries({ queryKey: ["nudge-preferences"] });
      await qc.invalidateQueries({ queryKey: ["task-nudge"] });
    } catch {
      toast.error("Couldn't save reminders.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="notiox-actions">
      <h2>Next-step reminders</h2>
      {query.isError && (
        <p role="alert">
          Couldn't load reminder settings.{" "}
          <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      {query.data && (
        <div>
          <label className="mt-4 flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={query.data.enabled}
              disabled={busy}
              onChange={(e) => void update(e.target.checked)}
            />
            Remind me in the app
          </label>
          {query.data.ignored_count >= 2 && (
            <button className="min-h-11" disabled={busy} onClick={() => void update(true)}>
              Resume reminders
            </button>
          )}
        </div>
      )}
    </section>
  );
}
