import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { Calendar, Loader2, AlertCircle, CheckCircle2, Pencil, Trash2, Clock } from "lucide-react";
import { extractMultipleSchedules } from "@/lib/scheduling.functions";
import { ScheduleCalendar, type WorkingHoursByDay } from "./schedule-calendar";
import { VoiceCaptureDialog } from "./voice-capture-dialog";
import type { TimeExtractionResult } from "@/lib/scheduling.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  syncTaskToGoogleCalendar,
  updateScheduledTask,
  deleteScheduledTask,
} from "@/lib/google-calendar.functions";
import { findOverlappingPairs } from "@/lib/tasks/chrono-schedule-fallback";
import { localeTimeOptions, usesAmPmClock } from "@/lib/time-format";
import { detectAccountTimezone } from "@/lib/timezones";
import type { NotioNode } from "./mindmap-canvas";

/** To-do titles = the map's non-root node labels (same source the to-do list
 *  renders). Passed to extraction so scheduled tasks reuse these exact names. */
function todoTitlesFromNodes(nodes?: NotioNode[]): string[] {
  if (!nodes?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of nodes) {
    if (!n.parent_id) continue; // skip the root node
    const label = (n.label ?? "").trim();
    const key = label.toLowerCase();
    if (label && !seen.has(key)) {
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/zoned-datetime";

/**
 * Drop only EXACT repeated schedule entries — same title AND same start
 * instant. Key on the full start time, NOT just the day, because a person can
 * legitimately do the same activity twice in one day (e.g. a 7 AM gym session
 * and a 9 PM one, or a morning and an evening work block). Those must both
 * survive; only a genuine duplicate at the identical time is removed.
 */
function dedupeTasksByTitleDay(
  tasks: TimeExtractionResult[],
): TimeExtractionResult[] {
  const seen = new Set<string>();
  return tasks.filter((t) => {
    if (!t.start_time_iso) return true;
    const key = `${t.title.trim().toLowerCase()}|${t.start_time_iso}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface AutoScheduleFromTranscriptProps {
  transcript: string;
  mapId: string;
  /** The map's mindmap nodes. Their labels are the to-do list titles; we pass
   *  them to extraction so scheduled tasks reuse the same names. */
  nodes?: NotioNode[];
  /** When the map was originally captured. Relative times ("tomorrow", "in 2
   *  hours") are resolved against THIS, not "now", so reopening an old map
   *  doesn't reschedule its tasks to the current day. */
  createdAt?: string;
  /** True once this map's transcript has already been run through the extractor.
   *  When set, we skip the AI call entirely and just show saved tasks - avoids
   *  burning tokens re-extracting on every open. */
  scheduleChecked?: boolean;
}

type SavedTask = {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  category: string;
  estimated_duration_minutes?: number | null;
  location?: string | null;
  attendees?: string[] | null;
  status?: string | null;
};

function durationMinutesFromTask(task: {
  start_time: string;
  end_time: string | null;
  estimated_duration_minutes?: number | null;
}): number {
  if (task.estimated_duration_minutes && task.estimated_duration_minutes > 0) {
    return task.estimated_duration_minutes;
  }
  if (task.end_time && task.start_time) {
    const mins = Math.round(
      (new Date(task.end_time).getTime() - new Date(task.start_time).getTime()) / 60_000,
    );
    if (mins >= 15) return Math.min(480, mins);
  }
  return 60;
}

function parseAttendeeInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AutoScheduleFromTranscript({
  transcript,
  mapId,
  nodes,
  createdAt,
  scheduleChecked,
}: AutoScheduleFromTranscriptProps) {
  const { supabase } = useSupabaseAuth();
  const updateFn = useServerFn(updateScheduledTask);
  const deleteFn = useServerFn(deleteScheduledTask);
  const [extractedTasks, setExtractedTasks] = useState<TimeExtractionResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savedTaskIds, setSavedTaskIds] = useState<Set<string>>(new Set());
  const [userTimezone, setUserTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [showVoiceCapture, setShowVoiceCapture] = useState(false);
  const [workingHoursByDay, setWorkingHoursByDay] = useState<WorkingHoursByDay | undefined>(undefined);
  const [savedTasks, setSavedTasks] = useState<SavedTask[]>([]);
  // Every scheduled item the user has, across all maps — the calendar shows the
  // whole day, not just what this transcript produced.
  const [allScheduled, setAllScheduled] = useState<SavedTask[]>([]);
  const [editing, setEditing] = useState<SavedTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editDuration, setEditDuration] = useState("60");
  const [editLocation, setEditLocation] = useState("");
  const [editAttendees, setEditAttendees] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Guards against the extractor running twice for the same map. React 19 Strict
  // Mode double-invokes effects (dev), and any remount / transcript-prop identity
  // change can re-fire this effect - each run is a separate AI call + save, which
  // is what produced duplicate scheduled tasks. Set synchronously BEFORE the async
  // work so a second (concurrent) invocation bails immediately. The DB unique index
  // (see migration) is the ultimate backstop for cross-mount races.
  const extractionStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (extractionStartedFor.current === mapId) return;
    extractionStartedFor.current = mapId;
    loadUserTimezoneAndExtract();
  }, [transcript, mapId]);

  const loadUserTimezoneAndExtract = async () => {
    if (!supabase || !transcript.trim()) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Get user's full working hours config
      const { data: workingHours } = await supabase
        .from("user_working_hours")
        .select("*")
        .maybeSingle();

      // One resolved TZ for UI + extract + save (never mix browser display with UTC extract).
      const resolvedTz =
        workingHours?.timezone?.trim() || detectAccountTimezone("UTC");
      setUserTimezone(resolvedTz);
      if (!workingHours?.timezone) {
        toast.warning(
          "Set your timezone in Profile for accurate task scheduling. Currently using your device timezone.",
          { duration: 5000 },
        );
      }

      // Build per-day working hours map for the calendar detail view
      if (workingHours) {
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const byDay: WorkingHoursByDay = {};
        days.forEach((day) => {
          const start = workingHours[`${day}_start`];
          const end = workingHours[`${day}_end`];
          byDay[day] = start && end ? { start, end } : null;
        });
        setWorkingHoursByDay(byDay);
      }

      // The task list below is only this map's, so it never looks like this
      // transcript "extracted" unrelated items (e.g. Climate meeting).
      const { data: existingTasks } = await supabase
        .from("scheduling_nodes")
        .select("id, title, start_time, end_time, category, estimated_duration_minutes, location, attendees, status")
        .eq("map_id", mapId)
        .not("start_time", "is", null);
      if (existingTasks) {
        setSavedTasks(existingTasks as SavedTask[]);
      }

      // The calendar, by contrast, behaves like a real calendar: opening a date
      // shows everything scheduled for it, from any map, done or still pending.
      const { data: everyTask } = await supabase
        .from("scheduling_nodes")
        .select("id, title, start_time, end_time, category, estimated_duration_minutes, location, attendees, status")
        .not("start_time", "is", null);
      if (everyTask) {
        setAllScheduled(everyTask as SavedTask[]);
      }

      const { transcriptLooksTimed } = await import("@/lib/tasks/chrono-schedule-fallback");
      const looksTimed = transcriptLooksTimed(transcript);

      // Stuck after refresh: flag said "checked" but nothing was saved for this map
      // (upsert ignoreDuplicates / missing user_id). Clear flag and re-extract.
      if (scheduleChecked && (!existingTasks || existingTasks.length === 0) && looksTimed) {
        await supabase.from("maps").update({ schedule_checked: false }).eq("id", mapId);
        // fall through to extract
      } else if (scheduleChecked) {
        setExtractedTasks([]);
        setError(null);
        return;
      } else if (existingTasks && existingTasks.length > 0) {
        // Rows already exist for this map — skip AI, just show them (editable).
        setExtractedTasks([]);
        setError(null);
        return;
      }

      // First time: extract tasks. Anchor relative phrases to when the map was
      // CAPTURED (createdAt), not now, so an old map keeps its original dates.
      const anchorISO = createdAt
        ? new Date(createdAt).toISOString()
        : new Date().toISOString();
      const rawResults = await extractMultipleSchedules({
        data: {
          transcript: transcript.slice(0, 12000),
          userTimezone: resolvedTz,
          currentDateTime: anchorISO,
          // Reuse the to-do list's names so scheduled titles match it exactly.
          taskTitles: todoTitlesFromNodes(nodes),
        },
      });

      // Final guard: never show or save the same activity title on the same
      // day twice, whatever the extractor returned.
      const results = dedupeTasksByTitleDay(rawResults);

      console.log("Extraction results:", results);

      setExtractedTasks(results);
      setError(null);

      // Drop stale same-title rows so Re-extract doesn't leave duplicates
      // with different start_times.
      if (results.length > 0) {
        const { data: existingForMap } = await supabase
          .from("scheduling_nodes")
          .select("id, title, start_time, source")
          .eq("map_id", mapId)
          .not("start_time", "is", null);
        if (existingForMap?.length) {
          const keepByTitle = new Map<string, Set<string>>();
          for (const r of results) {
            if (!r.start_time_iso) continue;
            const key = r.title.trim().toLowerCase();
            const set = keepByTitle.get(key) ?? new Set<string>();
            set.add(new Date(r.start_time_iso).toISOString());
            keepByTitle.set(key, set);
          }
          const staleIds = existingForMap
            .filter((row) => {
              if ((row as { source?: string | null }).source === "canvas") return false;
              const key = String(row.title ?? "").trim().toLowerCase();
              const keep = keepByTitle.get(key);
              if (!keep) return false;
              const iso = row.start_time
                ? new Date(row.start_time as string).toISOString()
                : "";
              return iso && !keep.has(iso);
            })
            .map((row) => row.id as string);
          if (staleIds.length > 0) {
            await supabase.from("scheduling_nodes").delete().in("id", staleIds);
          }
        }
      }

      // Auto-save every extracted task (must persist — otherwise refresh shows empty)
      for (const result of results) {
        await autoSaveTask(result, resolvedTz);
      }

      // Refresh this map's tasks so the list matches the transcript; refresh all
      // scheduled rows so the calendar still shows every day across maps.
      const selectCols =
        "id, title, start_time, end_time, category, estimated_duration_minutes, location, attendees, status";
      const { data: refreshed } = await supabase
        .from("scheduling_nodes")
        .select(selectCols)
        .eq("map_id", mapId)
        .not("start_time", "is", null);
      if (refreshed) {
        setSavedTasks(refreshed as SavedTask[]);
        const overlaps = findOverlappingPairs(refreshed as SavedTask[]);
        if (overlaps.length > 0) {
          toast.message("Some scheduled times overlap — tap Reschedule to change the time.");
        }
      }
      const { data: allRows } = await supabase
        .from("scheduling_nodes")
        .select(selectCols)
        .not("start_time", "is", null);
      if (allRows) setAllScheduled(allRows as SavedTask[]);

      // Only lock when we actually persisted rows, or transcript has no time cues.
      if ((refreshed && refreshed.length > 0) || !looksTimed) {
        await supabase.from("maps").update({ schedule_checked: true }).eq("id", mapId);
      } else if (results.length > 0) {
        toast.error("Times were found but couldn't be saved. Try refreshing.");
      } else if (looksTimed) {
        toast.message("Couldn't read times from this thought yet — open the map again to retry.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Error extracting schedule:", msg);
      setError(`Failed to extract schedule: ${msg}`);
      setExtractedTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const autoSaveTask = async (
    result: TimeExtractionResult,
    _timezone: string
  ) => {
    if (!supabase || !result.start_time_iso) return;

    try {
      const title =
        result.title.trim().length > 60
          ? result.title.trim().slice(0, 60).replace(/\s+\S*$/, "").trim() || "Task"
          : result.title.trim();

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      // Upsert WITHOUT ignoreDuplicates so we always get a row back and attach map_id.
      // (ignoreDuplicates was skipping inserts and leaving the map empty after refresh.)
      const { data: existing } = await supabase
        .from("scheduling_nodes")
        .select("id, source")
        .eq("user_id", auth.user.id)
        .eq("title", title)
        .eq("start_time", result.start_time_iso)
        .maybeSingle();
      if (existing?.source === "canvas") return;

      const payload = {
        user_id: auth.user.id,
        title,
        category: result.category,
        status: "pending",
        is_timebound: result.is_timebound,
        start_time: result.start_time_iso,
        end_time: result.end_time_iso,
        estimated_duration_minutes: result.estimated_duration_minutes,
        extracted_intent: result,
        original_transcript: transcript,
        source: "voice",
        priority: 2,
        map_id: mapId,
      };
      const upserted = existing
        ? await supabase.from("scheduling_nodes").update(payload).eq("id", existing.id).select("id").maybeSingle()
        : await supabase.from("scheduling_nodes").insert(payload).select("id").maybeSingle();
      let newTask = upserted.data;
      let error = upserted.error;
      if (error && /source/i.test(error.message)) {
        const { source: _source, ...withoutSource } = payload;
        const retry = existing
          ? await supabase.from("scheduling_nodes").update(withoutSource).eq("id", existing.id).select("id").maybeSingle()
          : await supabase.from("scheduling_nodes").insert(withoutSource).select("id").maybeSingle();
        newTask = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      if (newTask) {
        setSavedTaskIds((prev) => new Set([...prev, newTask.id]));

        await supabase.from("scheduling_logs").insert({
          node_id: newTask.id,
          action: "created",
          source: "auto_extract",
          reason: `Auto-extracted from transcript on map ${mapId}`,
        });

        if (FEATURE_FLAGS.googleCalendar && result.is_timebound) {
          syncTaskToGoogleCalendar({ data: { taskId: newTask.id } }).catch(() => undefined);
        }
      }
    } catch (error) {
      console.error("Error saving extracted task:", error);
      toast.error(
        error instanceof Error ? `Couldn't save task: ${error.message}` : "Couldn't save task.",
      );
    }
  };

  function openEdit(task: SavedTask) {
    setEditing(task);
    setEditTitle(task.title);
    setEditStart(toDatetimeLocalValue(task.start_time, userTimezone));
    setEditDuration(String(durationMinutesFromTask(task)));
    setEditLocation(task.location ?? "");
    setEditAttendees((task.attendees ?? []).join(", "));
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!editStart) {
      toast.error("Start time is required");
      return;
    }
    const durationMins = Number.parseInt(editDuration, 10);
    if (!Number.isFinite(durationMins) || durationMins < 15 || durationMins > 480) {
      toast.error("Duration must be between 15 and 480 minutes");
      return;
    }
    setEditSaving(true);
    try {
      const startIso = fromDatetimeLocalValue(editStart, userTimezone);
      const endIso = new Date(new Date(startIso).getTime() + durationMins * 60_000).toISOString();
      const attendees = parseAttendeeInput(editAttendees);
      const location = editLocation.trim();

      // Warn if the new time still overlaps another task on this map
      const others = savedTasks.filter((t) => t.id !== editing.id);
      const stillConflicts = others.some((t) =>
        findOverlappingPairs([
          { ...editing, start_time: startIso, end_time: endIso },
          t,
        ]).length > 0,
      );

      await updateFn({
        data: {
          taskId: editing.id,
          title: editTitle.trim(),
          startTime: startIso,
          durationMinutes: durationMins,
          location: location || null,
          attendees,
          isTimebound: true,
        },
      });

      const patch = {
        title: editTitle.trim(),
        start_time: startIso,
        end_time: endIso,
        estimated_duration_minutes: durationMins,
        location: location || null,
        attendees,
      };
      setSavedTasks((prev) =>
        prev.map((t) => (t.id === editing.id ? { ...t, ...patch } : t)),
      );
      setAllScheduled((prev) =>
        prev.map((t) => (t.id === editing.id ? { ...t, ...patch } : t)),
      );
      setEditing(null);
      if (stillConflicts) {
        toast.message("Saved — this time still overlaps another task on this map.");
      } else {
        toast.success("Saved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setEditSaving(false);
    }
  }

  async function removeTask(task: SavedTask) {
    try {
      await deleteFn({ data: { taskId: task.id } });
      setSavedTasks((prev) => prev.filter((t) => t.id !== task.id));
      setAllScheduled((prev) => prev.filter((t) => t.id !== task.id));
      if (editing?.id === task.id) setEditing(null);
      toast.success("Removed from schedule");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete task.");
    }
  }

  if (isLoading) {
    return (
      <div className="mt-12 border-t border-border pt-8">        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Extracting schedule from transcript…
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12 border-t border-border pt-8">        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  // Build the calendar list from freshly-extracted (this open) + all saved tasks,
  // deduped by title+start_time. Driven by saved data too, so a map that was
  // already checked still shows its tasks instead of a misleading empty state.
  const extractedCalendarTasks = extractedTasks
    .filter((task) => task.is_timebound && task.start_time_iso)
    .map((task, idx) => ({
      id: `extracted-${idx}`,
      title: task.title,
      start_time: task.start_time_iso!,
      end_time: task.end_time_iso ?? null,
      category: task.category,
    }));

  // Dedupe by a NORMALIZED key so the same task never renders twice. THE BUG:
  // freshly-extracted tasks carry an ISO timestamp (e.g. "2026-07-06T14:30:00.000Z")
  // while tasks refreshed from the DB carry a differently-formatted string
  // (e.g. "2026-07-06T14:30:00+00:00"). Comparing the raw strings missed the match,
  // so a just-saved task appeared twice - once from the extracted list, once from
  // the DB refresh. Normalizing title (trim/lowercase) + start_time (epoch millis)
  // collapses them to one. Falls back to the raw string if a value can't be parsed,
  // so unrelated tasks are never merged.
  const taskKey = (title: string, start: string | null) => {
    const ms = start ? new Date(start).getTime() : NaN;
    return `${title.trim().toLowerCase()}|${Number.isNaN(ms) ? (start ?? "none") : ms}`;
  };

  // This map's rows come first so their fresher edits win the dedupe; everything
  // else the user has scheduled fills in the rest of each day.
  const calendarByKey = new Map<string, SavedTask>();
  for (const t of [...extractedCalendarTasks, ...savedTasks, ...allScheduled]) {
    const k = taskKey(t.title, t.start_time);
    if (!calendarByKey.has(k)) calendarByKey.set(k, t);
  }
  const calendarTasks = [...calendarByKey.values()];

  // Prefer persisted tasks for UI (survives refresh). Fall back to in-memory extract.
  const displayTasks: SavedTask[] =
    savedTasks.length > 0
      ? savedTasks
      : extractedCalendarTasks.map((t) => ({
          id: t.id,
          title: t.title,
          start_time: t.start_time,
          end_time: t.end_time,
          category: t.category,
        }));

  const overlapPairs = findOverlappingPairs(
    displayTasks.filter((t) => !t.id.startsWith("extracted-")),
  );
  const conflictIds = new Set(overlapPairs.flatMap(([a, b]) => [a.id, b.id]));

  async function retryExtract() {
    extractionStartedFor.current = null;
    if (supabase) {
      await supabase.from("maps").update({ schedule_checked: false }).eq("id", mapId);
    }
    extractionStartedFor.current = mapId;
    await loadUserTimezoneAndExtract();
  }

  // Genuinely nothing scheduled
  if (displayTasks.length === 0 && calendarTasks.length === 0) {
    return (
      <div className="mt-12 border-t border-border pt-8">
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center">
          <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No scheduled times on this map yet.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Try mentioning a time like "2 PM tomorrow" or tap retry if you already did.
          </p>
          <button
            type="button"
            onClick={() => void retryExtract()}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-primary/10"
          >
            <Clock className="h-3.5 w-3.5" />
            Re-extract times
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-12 border-t border-border pt-8 space-y-8">
      {conflictIds.size > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Schedule conflict — times overlap
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap Reschedule on a task to change the time so they no longer collide.
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Scheduled tasks</h2>
          </div>
          <button
            type="button"
            onClick={() => void retryExtract()}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Re-extract
          </button>
        </div>

        <div className="space-y-3">
          {displayTasks
            .slice()
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map((task) => {
              const canEdit = !task.id.startsWith("extracted-");
              return (
                <div
                  key={task.id}
                  className={`rounded-xl border p-4 ${
                    conflictIds.has(task.id)
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground">{task.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{task.category}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {new Date(task.start_time).toLocaleString(
                          usesAmPmClock(userTimezone) ? "en-US" : "en-GB",
                          {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            ...localeTimeOptions(userTimezone),
                          },
                        )}
                        {task.end_time
                          ? ` – ${new Date(task.end_time).toLocaleString(
                              usesAmPmClock(userTimezone) ? "en-US" : "en-GB",
                              localeTimeOptions(userTimezone),
                            )}`
                          : ""}
                        {conflictIds.has(task.id) ? " · overlaps" : ""}
                      </p>
                    </div>
                    {canEdit ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
                    ) : null}
                  </div>

                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(task)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(task)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-primary/10"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeTask(task)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {calendarTasks.length > 0 && (
        <ScheduleCalendar
          tasks={calendarTasks}
          workingHours={workingHoursByDay}
          timezone={userTimezone}
          onTaskClick={(task) => {
            const saved = savedTasks.find((t) => t.id === task.id);
            if (saved) openEdit(saved);
          }}
        />
      )}

      {editing && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          onClick={() => !editSaving && setEditing(null)}
        >
          <div
            role="dialog"
            aria-label="Reschedule task"
            onClick={(e) => e.stopPropagation()}
            className="mb-1 max-h-[min(85vh,40rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold">Reschedule</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Change details below. Saved to Notio
              {FEATURE_FLAGS.googleCalendar ? " and Google Calendar" : ""}.
            </p>

            <div className="mt-4 max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto pr-0.5">
              <label className="block text-xs text-muted-foreground">
                Title
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="block text-xs text-muted-foreground">
                Start
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="block text-xs text-muted-foreground">
                Duration (min) <span className="text-muted-foreground/70">optional</span>
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="block text-xs text-muted-foreground">
                Location <span className="text-muted-foreground/70">optional</span>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Zoom link, cafe, address…"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="block text-xs text-muted-foreground">
                Attendees <span className="text-muted-foreground/70">optional</span>
                <input
                  value={editAttendees}
                  onChange={(e) => setEditAttendees(e.target.value)}
                  placeholder="email@example.com, other@…"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
                <span className="mt-1 block text-[10px] text-muted-foreground/70">
                  Emails only — Google may send invites.
                </span>
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={editSaving}
                onClick={() => setEditing(null)}
                className="flex-1 rounded-xl border border-border py-3 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={() => void saveEdit()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <VoiceCaptureDialog
        open={showVoiceCapture}
        onOpenChange={setShowVoiceCapture}
        onSubmit={async (text) => {
          const rawResults = await extractMultipleSchedules({
            data: {
              transcript: text,
              userTimezone,
              currentDateTime: new Date().toISOString(),
              taskTitles: todoTitlesFromNodes(nodes),
            },
          });
          const results = dedupeTasksByTitleDay(rawResults);
          for (const result of results) {
            await autoSaveTask(result, userTimezone);
          }
          const selectCols =
            "id, title, start_time, end_time, category, estimated_duration_minutes, location, attendees, status";
          const { data: refreshed } = await supabase!
            .from("scheduling_nodes")
            .select(selectCols)
            .eq("map_id", mapId)
            .not("start_time", "is", null);
          if (refreshed) setSavedTasks(refreshed as SavedTask[]);
          const { data: everyTask } = await supabase!
            .from("scheduling_nodes")
            .select(selectCols)
            .not("start_time", "is", null);
          if (everyTask) setAllScheduled(everyTask as SavedTask[]);
        }}
      />
    </div>
  );
}
