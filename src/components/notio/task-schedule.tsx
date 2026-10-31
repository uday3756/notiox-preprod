import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Check } from "lucide-react";
import { toast } from "sonner";
import { saveTaskSchedule, getTaskTimezone } from "@/lib/task-schedule.functions";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/zoned-datetime";
import type { ActionableTask } from "@/lib/task-completion.types";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { validateScheduleAgainstWorkingHours } from "@/lib/scheduling.functions";

export function TaskSchedule({ task }: { task: ActionableTask }) {
  const { userId } = useSupabaseAuth(),
    getZone = useServerFn(getTaskTimezone),
    save = useServerFn(saveTaskSchedule),
    qc = useQueryClient();
  const zone = useQuery({
    queryKey: ["task-timezone", userId],
    queryFn: () => getZone(),
    enabled: !!userId,
  });
  const timezone = zone.data ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const [open, setOpen] = useState(false),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [busy, setBusy] = useState(false),
    [alternative, setAlternative] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const validate = useServerFn(validateScheduleAgainstWorkingHours);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const first = fromDatetimeLocalValue(start, timezone),
        last = fromDatetimeLocalValue(end, timezone);
      if (!first || !last || Date.parse(first) >= Date.parse(last))
        throw new Error("Choose an end time after the start.");
      if (!reviewed) {
        const check = await validate({
          data: {
            startTimeISO: first,
            endTimeISO: last,
            category: "task",
            estimatedDurationMinutes: (Date.parse(last) - Date.parse(first)) / 60000,
            ignoreTaskId: task.id,
          },
        });
        setWarnings(check.violations);
        setAlternative(check.suggestions.earliest_valid_slot ?? null);
        setReviewed(true);
        return;
      }
      const result = await save({
        data: { id: task.id, revision: task.revision, start: first, end: last },
      });
      if (result.conflict) {
        setAlternative(result.suggestedStart ?? null);
        setReviewed(false);
        toast.message("This overlaps existing work. Choose another time.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["actionable-tasks"] });
      await qc.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      await qc.invalidateQueries({ queryKey: ["daily-ring-calendar"] });
      toast.success("Schedule saved");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }
  function edit() {
    setStart(task.start_time ? toDatetimeLocalValue(task.start_time, timezone) : "");
    setEnd(task.end_time ? toDatetimeLocalValue(task.end_time, timezone) : "");
    setReviewed(false);
    setAlternative(null);
    setOpen(!open);
  }
  return (
    <section className="mt-6">
      <button type="button" onClick={edit} className="inline-flex min-h-11 items-center gap-2">
        <CalendarDays size={18} />
        {task.start_time ? "Change schedule" : "Schedule"}
      </button>
      {open && (
        <form onSubmit={submit} className="notiox-task-editor">
          <p className="mb-4 text-sm text-muted-foreground">{timezone}</p>
          <label>
            Start
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setReviewed(false);
              }}
            />
          </label>
          <label>
            End
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setReviewed(false);
              }}
            />
          </label>
          {zone.isError && (
            <p role="alert">
              Couldn't load your timezone.{" "}
              <button type="button" onClick={() => void zone.refetch()}>
                Try again
              </button>
            </p>
          )}
          {reviewed && warnings.length > 0 && (
            <ul className="mb-4 text-sm text-amber-300">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {alternative && (
            <button
              type="button"
              className="mb-4 min-h-11"
              onClick={() => {
                const duration =
                  Date.parse(fromDatetimeLocalValue(end, timezone) || "") -
                  Date.parse(fromDatetimeLocalValue(start, timezone) || "");
                setStart(toDatetimeLocalValue(alternative, timezone));
                setEnd(
                  toDatetimeLocalValue(
                    new Date(
                      Date.parse(alternative) + Math.max(15 * 60000, duration || 0),
                    ).toISOString(),
                    timezone,
                  ),
                );
                setAlternative(null);
                setReviewed(false);
              }}
            >
              Review suggested time
            </button>
          )}
          {reviewed && (
            <p className="mb-4 text-sm">
              {task.title}: {start.replace("T", " ")} - {end.replace("T", " ")}
            </p>
          )}
          <button type="submit" disabled={busy || zone.isLoading || zone.isError}>
            <Check size={16} />
            {busy ? "Saving..." : reviewed ? "Confirm schedule" : "Review schedule"}
          </button>
        </form>
      )}
    </section>
  );
}
