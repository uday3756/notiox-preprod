import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  format,
  addDays,
  addMonths,
  startOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  parseISO,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";

interface SchedulingNode {
  id: string;
  title: string;
  category: string;
  start_time: string | null;
  end_time: string | null;
  status: "pending" | "in_progress" | "completed" | "deferred";
  estimated_duration_minutes?: number;
}

interface TimelineViewProps {
  tasks: SchedulingNode[];
  timezone: string;
  onTaskClick?: (taskId: string) => void;
  workingHours?: {
    start_hour: number;
    end_hour: number;
  };
}

type ScheduleView = "day" | "week" | "month";

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8 AM to 5 PM
const VIEW_OPTIONS: { id: ScheduleView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "border-primary/40 bg-primary/15 text-foreground",
  in_progress: "border-cyan/40 bg-cyan/15 text-foreground",
  completed: "border-emerald-400/40 bg-emerald-500/15 text-foreground",
  deferred: "border-border bg-muted/40 text-muted-foreground",
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  pending: Clock,
  in_progress: Clock,
  completed: CheckCircle2,
  deferred: AlertCircle,
};

function TaskCard({
  task,
  onClick,
  compact = false,
}: {
  task: SchedulingNode;
  onClick?: () => void;
  compact?: boolean;
}) {
  const Icon = STATUS_ICONS[task.status] || Clock;
  const colorClass = STATUS_COLORS[task.status] || STATUS_COLORS.deferred;

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border-l-4 text-left font-medium transition-colors hover:brightness-110 ${colorClass} ${
        compact ? "px-2 py-1.5 text-[11px]" : "p-2.5 text-xs"
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-80" />
        <div className="min-w-0 flex-1">
          <p className="truncate">{task.title}</p>
          {!compact && task.estimated_duration_minutes != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {task.estimated_duration_minutes}m
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function taskLocalDay(task: SchedulingNode, timezone: string): Date | null {
  if (!task.start_time) return null;
  try {
    return startOfDay(toZonedTime(parseISO(task.start_time), timezone));
  } catch {
    return null;
  }
}

export function TimelineView({
  tasks,
  timezone,
  onTaskClick,
  workingHours = { start_hour: 9, end_hour: 17 },
}: TimelineViewProps) {
  const [view, setView] = useState<ScheduleView>("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateStart = startOfDay(currentDate);

  const tasksByHour: Record<number, SchedulingNode[]> = {};
  HOURS.forEach((hour) => {
    tasksByHour[hour] = [];
  });

  tasks.forEach((task) => {
    if (!task.start_time) return;
    try {
      const localStart = toZonedTime(parseISO(task.start_time), timezone);
      const hour = localStart.getHours();
      const taskDate = startOfDay(localStart);
      if (
        taskDate.getTime() === dateStart.getTime() &&
        hour >= HOURS[0] &&
        hour <= HOURS[HOURS.length - 1]
      ) {
        if (!tasksByHour[hour]) tasksByHour[hour] = [];
        tasksByHour[hour].push(task);
      }
    } catch (e) {
      console.error("Error parsing task time:", e);
    }
  });

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: endOfWeek(currentDate, { weekStartsOn: 1 }) });
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const tasksOnDay = (day: Date) =>
    tasks.filter((t) => {
      const d = taskLocalDay(t, timezone);
      return d && d.getTime() === startOfDay(day).getTime();
    });

  const shift = (delta: number) => {
    if (view === "month") setCurrentDate(addMonths(currentDate, delta));
    else if (view === "week") setCurrentDate(addDays(currentDate, delta * 7));
    else setCurrentDate(addDays(currentDate, delta));
  };

  const heading =
    view === "month"
      ? format(currentDate, "MMMM yyyy")
      : view === "week"
        ? `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`
        : format(currentDate, "EEEE, MMMM d, yyyy");

  return (
    <div className="notiox-timeline w-full space-y-5">
      <div
        className="inline-flex rounded-xl border border-border bg-surface p-1"
        role="tablist"
        aria-label="Schedule view"
      >
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={view === opt.id}
            onClick={() => setView(opt.id)}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${
              view === opt.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground sm:text-lg">{heading}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-surface text-foreground hover:bg-surface-2"
            onClick={() => shift(-1)}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-surface text-foreground hover:bg-surface-2"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-surface text-foreground hover:bg-surface-2"
            onClick={() => shift(1)}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {view === "day" && (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex border-b border-border">
              <div className="flex w-20 flex-col border-r border-border bg-background/40">
                <div className="flex h-12 items-center justify-center border-b border-border text-xs font-semibold text-muted-foreground">
                  Time
                </div>
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="flex h-24 items-center justify-center border-b border-border text-xs font-medium text-muted-foreground last:border-b-0"
                  >
                    {hour}:00
                  </div>
                ))}
              </div>

              <div className="flex flex-1 flex-col overflow-x-auto">
                <div className="flex h-12 items-center border-b border-border bg-background/40 px-4 text-xs font-semibold text-muted-foreground">
                  Scheduled Tasks
                </div>
                {HOURS.map((hour) => {
                  const outside =
                    hour < workingHours.start_hour || hour >= workingHours.end_hour;
                  return (
                    <div
                      key={hour}
                      className={`relative h-24 border-b border-border p-2 last:border-b-0 transition-colors hover:bg-primary/5 ${
                        outside ? "bg-muted/20" : "bg-transparent"
                      }`}
                    >
                      <div className="space-y-1">
                        {tasksByHour[hour]?.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick?.(task.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {Object.values(tasksByHour).every((t) => t.length === 0) && (
            <div className="rounded-xl border border-dashed border-border bg-background/30 py-10 text-center text-sm text-muted-foreground">
              No tasks scheduled for this day
            </div>
          )}
        </>
      )}

      {view === "week" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {weekDays.map((day) => {
            const dayTasks = tasksOnDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => {
                  setCurrentDate(day);
                  setView("day");
                }}
                className={`rounded-xl border p-3 text-left transition-colors hover:border-primary/50 ${
                  isToday ? "border-primary bg-primary/10" : "border-border bg-surface"
                }`}
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  {format(day, "EEE")}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{format(day, "d")}</p>
                <div className="mt-2 space-y-1">
                  {dayTasks.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">—</p>
                  ) : (
                    dayTasks.slice(0, 3).map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        compact
                        onClick={() => onTaskClick?.(t.id)}
                      />
                    ))
                  )}
                  {dayTasks.length > 3 && (
                    <p className="text-[11px] text-muted-foreground">+{dayTasks.length - 3} more</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {view === "month" && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border bg-background/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-1 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const dayTasks = tasksOnDay(day);
              const inMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setCurrentDate(day);
                    setView("day");
                  }}
                  className={`min-h-20 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-primary/5 ${
                    !inMonth ? "opacity-40" : ""
                  } ${isToday ? "bg-primary/10" : ""}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="mt-1 block truncate text-[10px] text-primary">
                      {dayTasks.length} task{dayTasks.length === 1 ? "" : "s"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span>Pending / In progress</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <span>Deferred</span>
        </div>
      </div>
    </div>
  );
}
