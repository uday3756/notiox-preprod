import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Calendar, Check, Trash2, Clock, Bell, Pencil, X } from "lucide-react";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { usesAmPmClock } from "@/lib/time-format";
import { toast } from "sonner";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { OFFSET_OPTIONS, readOffset } from "@/lib/tasks/lead-time";
import {
  completeScheduledTask,
  deleteScheduledTask,
  updateScheduledTask,
} from "@/lib/google-calendar.functions";
import { updateReminderOffset } from "@/lib/task.functions";
import { isCanvasSource } from "@/lib/task-identity";
import { detectAccountTimezone } from "@/lib/timezones";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  tomorrowYmdInTimezone,
  ymdInTimezone,
} from "@/lib/zoned-datetime";

/**
 * CR-01 §4 — Scheduled-tasks list (Home).
 * Complete / delete / edit go through server fns so Google Calendar stays in sync.
 */

type Task = {
  id: string;
  title: string;
  start_time: string | null;
  due_at?: string | null;
  end_time: string | null;
  is_timebound: boolean | null;
  category: string | null;
  source?: string | null;
  extracted_intent: unknown;
  estimated_duration_minutes?: number | null;
  location?: string | null;
  attendees?: string[] | null;
};

type Bucket = { label: string; tasks: Task[] };

function durationMinutesFromTask(task: {
  start_time: string | null;
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

function bucketByDay(tasks: Task[], tz: string): Bucket[] {
  const now = new Date();
  const todayYmd = ymdInTimezone(now, tz);
  const tomorrowYmd = tomorrowYmdInTimezone(now, tz);
  const today: Task[] = [];
  const tomorrow: Task[] = [];
  const later: Task[] = [];
  const undated: Task[] = [];
  const overdue: Task[] = [];

  for (const t of tasks) {
    const when = t.start_time || t.due_at;
    if (!when) {
      undated.push(t);
      continue;
    }
    const ymd = ymdInTimezone(when, tz);
    if (ymd < todayYmd && t.start_time) overdue.push(t);
    else if (ymd === todayYmd) today.push(t);
    else if (ymd === tomorrowYmd) tomorrow.push(t);
    else later.push(t);
  }

  return [
    { label: "Overdue", tasks: overdue },
    { label: "Today", tasks: today },
    { label: "Tomorrow", tasks: tomorrow },
    { label: "Later", tasks: later },
    { label: "No date", tasks: undated },
  ].filter((b) => b.tasks.length > 0);
}

export function SchedulingSection() {
  const qc = useQueryClient();
  const completeFn = useServerFn(completeScheduledTask);
  const deleteFn = useServerFn(deleteScheduledTask);
  const updateFn = useServerFn(updateScheduledTask);
  const offsetFn = useServerFn(updateReminderOffset);

  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editDuration, setEditDuration] = useState("60");
  const [editLocation, setEditLocation] = useState("");
  const [editAttendees, setEditAttendees] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const { data: accountTimezone = detectAccountTimezone("UTC") } = useQuery({
    queryKey: ["account-timezone"],
    queryFn: async (): Promise<string> => {
      const { data } = await supabase
        .from("user_working_hours")
        .select("timezone")
        .maybeSingle();
      return data?.timezone?.trim() || detectAccountTimezone("UTC");
    },
    staleTime: 60_000,
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["scheduled-tasks"],
    queryFn: async (): Promise<Task[]> => {
      const wide = await supabase
        .from("scheduling_nodes")
        .select(
          "id, title, start_time, due_at, end_time, is_timebound, category, source, extracted_intent, estimated_duration_minutes, location, attendees",
        )
        .eq("status", "pending")
        .order("start_time", { ascending: true, nullsFirst: false });
      if (!wide.error) return (wide.data ?? []) as Task[];
      const { data, error } = await supabase
        .from("scheduling_nodes")
        .select(
          "id, title, start_time, end_time, is_timebound, category, extracted_intent, estimated_duration_minutes, location, attendees",
        )
        .eq("status", "pending")
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  function openEdit(task: Task) {
    setEditing(task);
    setEditTitle(task.title);
    setEditStart(task.start_time ? toDatetimeLocalValue(task.start_time, accountTimezone) : "");
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
      const startIso = fromDatetimeLocalValue(editStart, accountTimezone);
      const attendees = parseAttendeeInput(editAttendees);
      const location = editLocation.trim();
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
      toast.success("Task updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update task.");
    } finally {
      setEditSaving(false);
    }
  }

  async function completeTask(task: Task) {
    qc.setQueryData<Task[]>(["scheduled-tasks"], (prev) =>
      (prev ?? []).filter((t) => t.id !== task.id),
    );
    try {
      await completeFn({ data: { taskId: task.id } });
      toast.success("Task done");
    } catch {
      toast.error("Couldn't update task.");
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    }
  }

  async function deleteTask(task: Task) {
    qc.setQueryData<Task[]>(["scheduled-tasks"], (prev) =>
      (prev ?? []).filter((t) => t.id !== task.id),
    );
    try {
      await deleteFn({ data: { taskId: task.id } });
    } catch {
      toast.error("Couldn't delete task.");
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    }
  }

  async function changeOffset(task: Task, value: string) {
    const newOffset = value === "" ? null : Number(value);
    const baseIntent =
      task.extracted_intent && typeof task.extracted_intent === "object"
        ? (task.extracted_intent as Record<string, unknown>)
        : {};
    const nextIntent: Record<string, unknown> = { ...baseIntent };
    if (newOffset === null) delete nextIntent.remind_offset_minutes;
    else nextIntent.remind_offset_minutes = newOffset;

    qc.setQueryData<Task[]>(["scheduled-tasks"], (prev) =>
      (prev ?? []).map((t) => (t.id === task.id ? { ...t, extracted_intent: nextIntent } : t)),
    );

    try {
      await offsetFn({ data: { taskId: task.id, remind_offset_minutes: newOffset } });
      toast.success(
        newOffset === null
          ? "Reminder set to your default"
          : `Reminder set to ${OFFSET_OPTIONS.find((o) => o.minutes === newOffset)?.label ?? newOffset + "m"} before`,
      );
    } catch {
      toast.error("Couldn't update reminder time.");
      qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
    }
  }

  const buckets = bucketByDay(tasks ?? [], accountTimezone);

  return (
    <div className="mt-12 border-t border-border pt-8">
      <div className="mb-5 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Scheduled tasks</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center">
          <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No scheduled tasks yet.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Mention a time when you capture or journal — like "call mom at 6pm tomorrow" — and it
            shows up here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {buckets.map((bucket) => (
            <div key={bucket.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {bucket.label}
              </p>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {bucket.tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
                    >
                      <button
                        onClick={() => completeTask(task)}
                        aria-label="Mark done"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
                      >
                        <Check className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEdit(task)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium text-foreground">
                          {task.title}
                          {isCanvasSource(task.source) && (
                            <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              Canvas
                            </span>
                          )}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            {task.start_time ? (
                              task.is_timebound ? (
                              <span>
                                {(() => {
                                  const pat = usesAmPmClock(accountTimezone)
                                    ? "EEE, MMM d · h:mm a"
                                    : "EEE, MMM d · HH:mm";
                                  return formatInTimeZone(
                                    new Date(task.start_time),
                                    accountTimezone,
                                    pat,
                                  );
                                })()}
                              </span>
                            ) : (
                              <span>
                                {format(new Date(task.start_time), "EEE, MMM d")} · all day
                              </span>
                            )
                            ) : task.due_at ? (
                              <span>Due {format(new Date(task.due_at), "EEE, MMM d")}</span>
                            ) : (
                              <span>No date yet</span>
                            )}
                          </span>

                          {task.is_timebound && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Bell className="h-3 w-3" />
                              <select
                                value={readOffset(task.extracted_intent) ?? ""}
                                onChange={(e) => changeOffset(task, e.target.value)}
                                aria-label="Reminder lead time"
                                className="cursor-pointer bg-transparent text-[11px] text-muted-foreground outline-none"
                              >
                                <option value="">Default</option>
                                {OFFSET_OPTIONS.map((o) => (
                                  <option key={o.minutes} value={o.minutes}>
                                    {o.label} before
                                  </option>
                                ))}
                              </select>
                            </span>
                          )}
                        </div>
                      </button>

                      <button
                        onClick={() => openEdit(task)}
                        aria-label="Edit task"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => deleteTask(task)}
                        aria-label="Delete task"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !editSaving && setEditing(null)}
          >
            <motion.div
              role="dialog"
              aria-label="Edit scheduled task"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="mb-1 max-h-[min(85vh,40rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">Edit task</h3>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={editSaving}
                  onClick={() => setEditing(null)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="block text-xs text-muted-foreground">
                Title
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="mt-3 block text-xs text-muted-foreground">
                Start
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="mt-3 block text-xs text-muted-foreground">
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

              <label className="mt-3 block text-xs text-muted-foreground">
                Location <span className="text-muted-foreground/70">optional</span>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Zoom link, cafe, address…"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="mt-3 block text-xs text-muted-foreground">
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

              <button
                type="button"
                disabled={editSaving}
                onClick={saveEdit}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
