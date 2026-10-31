import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DailyRings, buildRingProgress } from "@/components/notio/daily-rings";
import {
  currentTimeBlock,
  logicalDate,
  normalizeRingSettings,
  todayLogicalDate,
  type RingSettings,
} from "@/lib/rings/day";
import type { TimeBlock } from "@/lib/rings/geometry";
import { BLOCK_ORDER, RING_COLORS } from "@/lib/rings/geometry";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { ActionableTasks } from "@/components/notio/actionable-tasks";
import { DolphinProgress } from "@/components/notio/dolphin-progress";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRingsPage,
});

type RingNode = {
  id: string;
  label: string;
  done: boolean | null;
  time_block: TimeBlock | null;
  logical_date: string | null;
  completed_at: string | null;
  created_at: string;
};

/** Calendar row (scheduling_nodes) — the source the Notio calendar renders. */
type CalendarRow = {
  id: string;
  title: string;
  status: string | null;
  start_time: string | null;
};

/** A task on the viewed day, from either a mind map or the calendar. */
type DayTask = {
  id: string;
  label: string;
  done: boolean;
  time_block: TimeBlock | null;
};

function HomeRingsPage() {
  const qc = useQueryClient();
  const [celebrate, setCelebrate] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["ring-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_working_hours")
        .select(
          "timezone, day_start_hour, block_boundaries, daily_task_estimate, rings_celebrated_on",
        )
        .maybeSingle();
      if (error) throw error;
      return normalizeRingSettings(data as Record<string, unknown> | null);
    },
  });

  const settings: RingSettings = settingsQuery.data ?? normalizeRingSettings(null);
  const logicalToday = todayLogicalDate(settings);

  // 0 = today, -1 = yesterday. Never positive; there is no future to show.
  const [dayOffset, setDayOffset] = useState(0);
  const viewedDate =
    dayOffset === 0
      ? logicalToday
      : format(addDays(parseISO(logicalToday), dayOffset), "yyyy-MM-dd");
  const isToday = dayOffset === 0;

  const nodesQuery = useQuery({
    queryKey: ["daily-ring-nodes", viewedDate],
    enabled: !!settingsQuery.data || settingsQuery.isFetched,
    queryFn: async () => {
      // Completed on the viewed day (by logical_date) + open tasks with a block.
      const { data, error } = await supabase
        .from("nodes")
        .select(
          "id, label, done, time_block, logical_date, completed_at, created_at, parent_id",
        )
        .not("parent_id", "is", null)
        .or(
          `logical_date.eq.${viewedDate},and(done.eq.false,time_block.not.is.null)`,
        );
      if (error) throw error;
      return (data ?? []) as RingNode[];
    },
  });

  // Calendar entries for the viewed day. Fetched with a wide UTC window and
  // narrowed below, because the logical day depends on timezone + rollover.
  const calendarQuery = useQuery({
    queryKey: ["daily-ring-calendar", viewedDate],
    enabled: !!settingsQuery.data || settingsQuery.isFetched,
    queryFn: async () => {
      // Wide window so a "tomorrow 9am" capture (map node created today)
      // can be matched to its scheduled start and kept off Open today.
      const from = `${format(addDays(parseISO(viewedDate), -7), "yyyy-MM-dd")}T00:00:00.000Z`;
      const to = `${format(addDays(parseISO(viewedDate), 21), "yyyy-MM-dd")}T00:00:00.000Z`;
      const { data, error } = await supabase
        .from("scheduling_nodes")
        .select("id, title, status, start_time")
        .not("start_time", "is", null)
        .gte("start_time", from)
        .lt("start_time", to);
      if (error) throw error;
      return (data ?? []) as CalendarRow[];
    },
  });

  const allNodes = nodesQuery.data ?? [];
  const allCalendar = calendarQuery.data ?? [];

  /**
   * Due/scheduled on the viewed day. Timed work uses scheduling_nodes.start_time
   * (or a title-matched calendar row). Untimed open map nodes created on this
   * day stay out of this list — they go in capturedToday so "tomorrow 9am"
   * never appears under Open today.
   */
  const { dayTasks, capturedToday } = useMemo(() => {
    const key = (s: string) => s.trim().toLowerCase();
    const scheduleByTitle = new Map<string, CalendarRow>();
    for (const c of allCalendar) {
      if (!c.start_time || !c.title) continue;
      const k = key(c.title);
      if (!scheduleByTitle.has(k)) scheduleByTitle.set(k, c);
    }

    const seen = new Set<string>();
    const due: DayTask[] = [];
    const captured: DayTask[] = [];

    for (const n of allNodes) {
      const k = key(n.label);
      const matched = scheduleByTitle.get(k);
      if (n.done) {
        if (n.logical_date !== viewedDate) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        due.push({
          id: n.id,
          label: n.label,
          done: true,
          time_block: (n.time_block as TimeBlock | null) ?? null,
        });
        continue;
      }
      if (matched?.start_time) {
        if (
          logicalDate(matched.start_time, settings.timezone, settings.day_start_hour) !==
          viewedDate
        ) {
          continue;
        }
        if (seen.has(k)) continue;
        seen.add(k);
        due.push({
          id: n.id,
          label: n.label,
          done: false,
          time_block:
            (n.time_block as TimeBlock | null) ??
            currentTimeBlock(settings, new Date(matched.start_time)),
        });
        continue;
      }
      if (
        logicalDate(n.created_at, settings.timezone, settings.day_start_hour) === viewedDate
      ) {
        captured.push({
          id: n.id,
          label: n.label,
          done: false,
          time_block: (n.time_block as TimeBlock | null) ?? null,
        });
      }
    }

    for (const c of allCalendar) {
      if (!c.start_time || !c.title) continue;
      if (logicalDate(c.start_time, settings.timezone, settings.day_start_hour) !== viewedDate) {
        continue;
      }
      const k = key(c.title);
      if (seen.has(k)) continue;
      seen.add(k);
      due.push({
        id: `cal:${c.id}`,
        label: c.title,
        done: c.status === "completed",
        time_block: currentTimeBlock(settings, new Date(c.start_time)),
      });
    }

    return { dayTasks: due, capturedToday: captured };
  }, [allNodes, allCalendar, viewedDate, settings]);

  const progress = useMemo(
    () =>
      buildRingProgress(
        settings.daily_task_estimate,
        dayTasks.map((t) => ({ time_block: t.time_block, done: t.done })),
      ),
    [dayTasks, settings.daily_task_estimate],
  );

  const allFull = BLOCK_ORDER.every(
    (b) => progress[b].capacity > 0 && progress[b].completed >= progress[b].capacity,
  );

  const alreadyCelebrated = settings.rings_celebrated_on === logicalToday;

  // Fire celebration once when all full and not yet marked for today.
  useEffect(() => {
    if (isToday && allFull && !alreadyCelebrated && !celebrate && nodesQuery.isSuccess) {
      setCelebrate(true);
    }
  }, [isToday, allFull, alreadyCelebrated, celebrate, nodesQuery.isSuccess]);

  const markCelebrated = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await supabase
        .from("user_working_hours")
        .upsert(
          {
            user_id: u.user.id,
            rings_celebrated_on: logicalToday,
            timezone: settings.timezone,
          } as never,
          { onConflict: "user_id" },
        );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ring-settings"] });
    },
  });

  const onCelebrateDone = useCallback(() => {
    if (!alreadyCelebrated) markCelebrated.mutate();
  }, [alreadyCelebrated, markCelebrated]);

  const openTasks = dayTasks.filter((t) => !t.done);
  const unassignedTasks = openTasks.filter((t) => !t.time_block);
  const activeBlock = isToday ? currentTimeBlock(settings) : undefined;
  const loading =
    settingsQuery.isLoading || nodesQuery.isLoading || calendarQuery.isLoading;

  const dayLabel = isToday
    ? "Today"
    : dayOffset === -1
      ? "Yesterday"
      : format(parseISO(viewedDate), "EEE, d MMM");

  return (
    <div className="notiox-screen notiox-home mx-auto min-h-dvh max-w-md px-4 pb-28 pt-4">
      <header className="mb-4 flex items-center justify-end">
        <span className="text-xs text-muted-foreground tabular-nums">{viewedDate}</span>
      </header>

      <div className="notiox-day-heading flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDayOffset((d) => d - 1)}
          aria-label="Previous day"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="min-w-0 flex-1 break-words font-display text-2xl font-semibold tracking-tight">
          {dayLabel}
        </h1>
        <button
          type="button"
          onClick={() => setDayOffset((d) => Math.min(0, d + 1))}
          disabled={isToday}
          aria-label="Next day"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-35 disabled:hover:border-border disabled:hover:text-muted-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Complete mindmap tasks to light morning, afternoon, and evening rings.
      </p>

      <div className="notiox-rings-surface mt-8 p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DailyRings
            progress={progress}
            activeBlock={activeBlock}
            celebrate={celebrate && allFull && !alreadyCelebrated}
            onCelebrateDone={onCelebrateDone}
          />
        )}
      </div>

      <section className="notiox-day-tasks mt-8">
        {FEATURE_FLAGS.dolphinXp && isToday && <DolphinProgress/>}
        {FEATURE_FLAGS.workflow && isToday && <ActionableTasks compact title="Next action"/>}
        <div hidden={FEATURE_FLAGS.workflow && isToday}>
        <h2 className="text-sm font-medium text-muted-foreground">
          {isToday ? "Open today" : `Left open on ${dayLabel.toLowerCase()}`}
        </h2>
        {openTasks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {isToday
              ? "No open tasks on today's rings yet. Capture a thought or finish items on a map."
              : "Nothing was left open on this day."}
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {BLOCK_ORDER.map((block, i) => {
              const items = openTasks.filter((t) => t.time_block === block);
              if (items.length === 0) return null;
              return (
                <div key={block}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ background: RING_COLORS[i] }}
                    />
                    <h3 className="text-xs font-medium capitalize">{block}</h3>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                    {block === activeBlock && (
                      <span className="text-[9px] uppercase tracking-wide text-primary">now</span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-2">
                    {items.map((t) => (
                      <li
                        key={t.id}
                        className="break-words rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium"
                        style={{ borderLeft: `3px solid ${RING_COLORS[i]}` }}
                      >
                        {t.label}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {unassignedTasks.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground">
                  Not assigned to a block yet
                </h3>
                <ul className="mt-2 space-y-2">
                  {unassignedTasks.map((t) => (
                    <li
                      key={t.id}
                      className="break-words rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium"
                    >
                      {t.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {isToday && capturedToday.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-medium text-muted-foreground">Captured today (not scheduled yet)</h3>
            <ul className="mt-2 space-y-2">
              {capturedToday.map((t) => (
                <li
                  key={t.id}
                  className="break-words rounded-xl border border-dashed border-border bg-surface px-3 py-2.5 text-sm font-medium"
                >
                  {t.label}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
