import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Clock, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parseISO, isSameDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  clockPattern,
  formatWorkingHoursClock,
  usesAmPmClock,
} from "@/lib/time-format";

interface Task {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  category: string;
  status?: string | null;
}

export interface WorkingHoursByDay {
  // keyed by lowercase weekday name → { start, end } | null (not a working day)
  [day: string]: { start: string; end: string } | null;
}

interface ScheduleCalendarProps {
  tasks: Task[];
  onDateClick?: (date: Date) => void;
  /** Called when the user taps a scheduled task row (edit flow). */
  onTaskClick?: (task: Task) => void;
  workingHours?: WorkingHoursByDay;
  timezone?: string;
}

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function ScheduleCalendar({ tasks, onDateClick, onTaskClick, workingHours, timezone }: ScheduleCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const tz = timezone || "UTC";
  const tasksMap = new Map<string, Task[]>();
  tasks.forEach((task) => {
    if (task.start_time) {
      // Group by the day in the user's timezone (single conversion — do not
      // combine toZonedTime + format(..., { timeZone }) or times shift).
      const dateKey = formatInTimeZone(parseISO(task.start_time), tz, "yyyy-MM-dd");
      if (!tasksMap.has(dateKey)) {
        tasksMap.set(dateKey, []);
      }
      tasksMap.get(dateKey)!.push(task);
    }
  });

  const getTasksForDate = (date: Date) => {
    // Calendar cells are civil dates; match task keys already in account TZ.
    const dateKey = format(date, "yyyy-MM-dd");
    return tasksMap.get(dateKey) || [];
  };

  const todayKey = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateClick?.(date);
  };

  // Working-hours clock: AM/PM only for US / AU / NZ / CA / PH accounts.
  const prettyTime = (t: string) => formatWorkingHoursClock(t, timezone);

  const selectedWorkingHours = selectedDate && workingHours
    ? workingHours[WEEKDAY_KEYS[selectedDate.getDay()]]
    : undefined;

  const selectedTasks = selectedDate
    ? getTasksForDate(selectedDate).sort((a, b) =>
        a.start_time.localeCompare(b.start_time)
      )
    : [];

  return (
    <div className="mt-12 border-t border-border pt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold">Schedule Calendar</h2>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-accent rounded"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-accent rounded"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 bg-surface/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="p-3 text-center font-medium text-sm text-muted-foreground border-b border-border"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {/* Leading blanks so day 1 sits under its real weekday (0=Sun..6=Sat).
              Without these every month wrongly started on Sunday. */}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`blank-${i}`} className="min-h-24 border-b border-r bg-surface/30" />
          ))}
          {daysInMonth.map((date) => {
            const dayTasks = getTasksForDate(date);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isToday = format(date, "yyyy-MM-dd") === todayKey;

            return (
              <button
                key={date.toString()}
                onClick={() => handleDateClick(date)}
                className={`min-h-24 p-2 border-b border-r text-left transition-colors ${
                  isCurrentMonth
                    ? "bg-background hover:bg-accent/50"
                    : "bg-surface/30 text-muted-foreground"
                } ${isToday ? "bg-primary/10 border-primary" : ""} ${
                  selectedDate && isSameDay(date, selectedDate) ? "ring-2 ring-primary ring-inset" : ""
                }`}
              >
                <div className={`font-medium text-sm mb-1 ${isToday ? "text-primary" : ""}`}>
                  {format(date, "d")}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 2).map((task) => (
                    <div
                      key={task.id}
                      className={`text-xs rounded px-1 py-0.5 truncate ${
                        task.status === "completed"
                          ? "bg-primary/10 text-primary/50 line-through"
                          : "bg-primary/20 text-primary"
                      }`}
                      title={task.title}
                    >
                      {task.title}
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayTasks.length - 2} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDate ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">
                {format(selectedDate, "EEEE, MMMM d, yyyy")}
              </h3>
              {/* Working hours for this day */}
              <div className="mt-1 flex items-center gap-1.5 text-sm">
                <Clock className="h-3.5 w-3.5 text-primary" />
                {selectedWorkingHours ? (
                  <span className="text-muted-foreground">
                    Working hours:{" "}
                    <span className="font-medium text-foreground">
                      {prettyTime(selectedWorkingHours.start)} – {prettyTime(selectedWorkingHours.end)}
                    </span>
                    {timezone && <span className="text-muted-foreground/70"> ({timezone})</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {workingHours ? "Not a working day" : "Working hours not set"}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedDate(null)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scheduled tasks for this day */}
          <div className="mt-5">
            <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Scheduled tasks
            </p>
            {selectedTasks.length > 0 ? (
              <div className="space-y-2">
                {selectedTasks.map((task) => {
                  // Render task times in the user's working-hours timezone (not browser local)
                  const tz = timezone || "UTC";
                  const ampm = usesAmPmClock(tz);
                  const startInstant = parseISO(task.start_time);
                  const startHHmm = formatInTimeZone(startInstant, tz, "HH:mm");
                  // Is the task within the working window?
                  const withinHours = selectedWorkingHours
                    ? startHHmm >= selectedWorkingHours.start.slice(0, 5) &&
                      startHHmm <= selectedWorkingHours.end.slice(0, 5)
                    : true;
                  return (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => onTaskClick?.(task)}
                      className={`flex w-full items-center justify-between rounded-xl border border-border bg-background p-3 text-left transition-colors ${
                        onTaskClick ? "hover:border-primary/40 hover:bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center rounded-lg bg-primary/15 px-2.5 py-1.5">
                          {ampm ? (
                            <>
                              <span className="text-sm font-bold text-primary">
                                {formatInTimeZone(startInstant, tz, "h:mm")}
                              </span>
                              <span className="text-[10px] uppercase text-primary/70">
                                {formatInTimeZone(startInstant, tz, "a")}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-primary">
                              {formatInTimeZone(startInstant, tz, "HH:mm")}
                            </span>
                          )}
                        </div>
                        <div>
                          <p
                            className={`text-sm font-semibold line-clamp-2 ${
                              task.status === "completed"
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                            }`}
                          >
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {task.category}
                            {task.end_time &&
                              ` · until ${formatInTimeZone(parseISO(task.end_time), tz, clockPattern(tz))}`}
                            {task.status === "completed" ? " · done" : ""}
                          </p>
                        </div>
                      </div>
                      {!withinHours && (
                        <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-medium text-yellow-600">
                          Outside hours
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-center text-sm text-muted-foreground">
                No tasks scheduled for this day.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-xs text-muted-foreground">
          <p>Click a date to view its working hours and scheduled tasks</p>
        </div>
      )}
    </div>
  );
}
