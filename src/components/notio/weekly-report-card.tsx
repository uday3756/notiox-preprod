/**
 * Feature 2 — Weekly Reflection Report in-app card.
 *
 * Dark-mode dashboard aesthetic (matches the CEO reference mock):
 *   - No borders; cards are slightly lighter than the bg for subtle depth.
 *   - Cyan (#35E0F0) accents on key numbers + icons.
 *   - All-caps muted-grey section labels.
 *   - Generous padding + high border radius (rounded-3xl).
 *   - 2-column metrics grid for "what you closed".
 *
 * Tapping opens the full-page route /weekly-report.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getLatestReport } from "@/lib/weekly-report.functions";
import { getEfWeek, markPaywallShown } from "@/lib/ef/ef.functions";
import { toast } from "sonner";
import { EfWidget } from "./ef/ef-widget";
import { EfDetailSheet } from "./ef/ef-detail-sheet";
import { EfUpgradeSheet } from "./ef/ef-upgrade-sheet";
import { PatternsWidget } from "./ef/patterns-widget";
import { format } from "date-fns";

type ReportRow = {
  id: string;
  week_start: string;
  week_end: string;
  content: {
    wins: string[];
    completed_count: number;
    days_active?: number;
    motivational_note?: string;
    focus_areas: { category: string; suggestion: string }[];
    reflection_question: string;
  } | null;
  raw_text: string | null;
  created_at: string;
};

export function WeeklyReportCard() {
  const getLatest = useServerFn(getLatestReport);
  const getEf = useServerFn(getEfWeek);
  const markShown = useServerFn(markPaywallShown);

  const [sheet, setSheet] = useState<null | "detail" | "upgrade">(null);
  // markShown() is fire-and-forget and doesn't invalidate the ef query, so the
  // server's paywallSeenThisWeek stays stale for this session. Without this
  // local flag a free user could reopen the sheet on every tap — the handoff is
  // explicit that it's "once per week, not once per tap".
  const [paywallShownLocal, setPaywallShownLocal] = useState(false);

  const { data: report, isLoading } = useQuery({
    queryKey: ["weekly-report", "latest"],
    queryFn: () => getLatest(),
  });

  const { data: ef } = useQuery({
    queryKey: ["ef", "week"],
    queryFn: () => getEf(),
  });

  // Handoff §4 — this is the tier boundary, stated plainly.
  function onWidgetTap() {
    if (!ef?.score) return;
    if (ef.isPro) {
      setSheet("detail");
      return;
    }
    // Frequency guard: at most once per user per week. Later taps in the same
    // week dismiss back to the widget — with a toast, not silence, so "blocked
    // by design" is never mistaken for "broken".
    if (ef.paywallSeenThisWeek || paywallShownLocal) {
      toast("Already peeked at this this week — check back next week!");
      return;
    }
    setSheet("upgrade");
    setPaywallShownLocal(true);
    void markShown();
  }

  // Loading state — render a subtle placeholder so the section doesn't pop in.
  if (isLoading) {
    return (
      <div className="mt-8 h-24 animate-pulse rounded-3xl bg-surface" aria-hidden />
    );
  }

  // No report yet — render a CTA card so the user always has an entry point
  // to /weekly-report from the home page. Without this, the feature is
  // invisible until the cron runs (which can be days).
  if (!report) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
        <Link
          to="/weekly-report"
          className="block rounded-3xl bg-surface p-6 transition-colors hover:bg-surface-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your week in mind
          </p>
          <p className="mt-3 font-display text-lg font-semibold text-foreground">
            Your first reflection is waiting
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A gentle look back at your week — wins, completed tasks, and what kept coming up. Tap to generate it now.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan">
            Generate your first report
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </motion.section>
    );
  }

  const r = report as ReportRow | null;
  if (!r) return null;

  const wins = r.content?.wins ?? [];
  const focusAreas = r.content?.focus_areas ?? [];
  const completedCount = r.content?.completed_count ?? 0;
  const daysActive = r.content?.days_active ?? 0;
  const motivationalNote = r.content?.motivational_note;
  const zeroWeek = daysActive === 0 && wins.length === 0 && completedCount === 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 space-y-5"
    >
      {/* Header — main title + subheadline */}
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Your week in mind
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {zeroWeek
            ? "A quiet week. Here's a small nudge to start fresh."
            : `Built from ${wins.length} ${wins.length === 1 ? "win" : "wins"} and ${completedCount} ${completedCount === 1 ? "task" : "tasks"} closed across ${daysActive} ${daysActive === 1 ? "day" : "days"}. Nothing else.`}
        </p>
      </div>

      {/* EF widget — free and Pro alike, no pillar values exposed (handoff §3) */}
      {ef?.score && (
        <EfWidget
          score={ef.score}
          priorComposite={ef.priorComposite}
          onTap={onWidgetTap}
        />
      )}

      {/* A small nudge — EF-driven. Handoff §5: the EF suggested focus REPLACES
          the generic nudge; they never both render. Falls back to the old
          zero-week note when there's no EF score yet. */}
      {(ef?.score?.nudge ?? (zeroWeek ? motivationalNote : null)) && (
        <div className="rounded-3xl border border-blue-500/40 bg-blue-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
            A small nudge
          </p>
          <p className="mt-2 text-sm text-foreground">
            {ef?.score?.nudge ?? motivationalNote}
          </p>
        </div>
      )}

      {/* THIS WEEK'S MAP — large feature card with wins as "bright nodes" */}
      <Link
        to="/weekly-report"
        className="block rounded-3xl bg-surface p-6 transition-colors hover:bg-surface-2"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          This week&rsquo;s map
        </p>
        {/* Node graph: wins rendered as glowing cyan nodes on thin dark lines */}
        <div className="mt-5 flex items-center justify-center gap-3 py-4">
          {wins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wins recorded yet.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {wins.slice(0, 6).map((w, i) => (
                <div
                  key={i}
                  className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-cyan shadow-[0_0_12px_2px_var(--color-cyan)]"
                  title={w}
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
              {wins.length > 6 && (
                <span className="text-xs font-medium text-muted-foreground">
                  +{wins.length - 6}
                </span>
              )}
            </div>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="font-semibold text-cyan">
            {wins.length} {wins.length === 1 ? "BRIGHT NODE" : "BRIGHT NODES"}
          </span>{" "}
          {wins.length === 1 ? "was" : "were"} worth keeping this week.
        </p>
      </Link>

      {/* WHAT KEPT COMING UP — list-style cards with cyan circle icons */}
      {focusAreas.length > 0 && (
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            What kept coming up
          </p>
          <div className="space-y-2.5">
            {focusAreas.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-3xl bg-surface p-4"
              >
                <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-cyan" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {f.category}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {f.suggestion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WHAT YOU CLOSED — 2-column metrics grid */}
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What you closed
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-3xl bg-surface p-5">
            <p className="text-xs text-muted-foreground">Days active</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-bold text-foreground">
                {daysActive}
              </span>
              <span className="text-sm text-muted-foreground">/ 7</span>
            </div>
          </div>
          <div className="rounded-3xl bg-surface p-5">
            <p className="text-xs text-muted-foreground">Wins recorded</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-bold text-foreground">
                {wins.length}
              </span>
              <ArrowUpRight className="h-4 w-4 text-cyan" />
            </div>
          </div>
          <div className="rounded-3xl bg-surface p-5">
            <p className="text-xs text-muted-foreground">Tasks completed</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-bold text-foreground">
                {completedCount}
              </span>
              <ArrowUpRight className="h-4 w-4 text-cyan" />
            </div>
          </div>
        </div>
      </div>

      {/* One reflection question — soft accent box */}
      {r.content?.reflection_question && (
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            One reflection question
          </p>
          <p className="mt-2 text-sm text-foreground">
            {r.content.reflection_question}
          </p>
        </div>
      )}

      {/* Patterns — below the reflection question, above the date stamp (handoff §2) */}
      {ef && (
        <PatternsWidget
          patterns={ef.patterns}
          isPro={ef.isPro}
          weeksOfHistory={ef.weeksOfHistory}
        />
      )}

      {/* See past reports link */}
      <Link
        to="/weekly-report"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan hover:underline"
      >
        See past reports
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>

      <p className="text-xs text-muted-foreground">
        {format(new Date(r.week_start), "MMM d")} –{" "}
        {format(new Date(r.week_end), "MMM d, yyyy")}
      </p>

      {/* Both sheets are overlays on this screen — no new routes (handoff §1) */}
      {sheet === "detail" && ef?.score && (
        <EfDetailSheet
          score={ef.score}
          trend={ef.trend}
          priorComposite={ef.priorComposite}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "upgrade" && ef?.score && (
        <EfUpgradeSheet score={ef.score} onClose={() => setSheet(null)} />
      )}
    </motion.section>
  );
}
