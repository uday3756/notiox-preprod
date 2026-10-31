import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listReports, regenerateMyReport } from "@/lib/weekly-report.functions";
import { getEfHistory, markPaywallShown } from "@/lib/ef/ef.functions";
import { mondayKeyOf } from "@/lib/ef/week";
import { EfWidget } from "@/components/notio/ef/ef-widget";
import { EfDetailSheet } from "@/components/notio/ef/ef-detail-sheet";
import { EfUpgradeSheet } from "@/components/notio/ef/ef-upgrade-sheet";
import { PatternsWidget } from "@/components/notio/ef/patterns-widget";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { formatReportRange, selectDisplayReports } from "@/lib/weekly-report-display";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/weekly-report")({
  // Production with the feature off shouldn't expose this route at all.
  beforeLoad: () => {
    if (!FEATURE_FLAGS.weeklyReflection) {
      throw redirect({ to: "/maps", replace: true });
    }
  },
  component: WeeklyReportPage,
});

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

function WeeklyReportPage() {
  const qc = useQueryClient();
  const list = useServerFn(listReports);
  const regenerate = useServerFn(regenerateMyReport);
  const getEf = useServerFn(getEfHistory);
  const markShown = useServerFn(markPaywallShown);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | "detail" | "upgrade">(null);
  // See note in weekly-report-card.tsx: guards against the stale-cache
  // reopen-on-every-tap case ("once per week, not once per tap").
  const [paywallShownLocal, setPaywallShownLocal] = useState(false);
  const [activeWeekStart, setActiveWeekStart] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["weekly-report", "list"],
    queryFn: () => list(),
  });

  const { data: ef } = useQuery({
    queryKey: ["ef", "history"],
    queryFn: () => getEf(),
  });

  function onWidgetTap(efWeekStart: string) {
    if (!ef) return;
    setActiveWeekStart(efWeekStart);
    if (ef.isPro) {
      setSheet("detail");
      return;
    }
    // Same once-per-week guard as the Maps-screen widget, anchored to the
    // current week regardless of which historical row was tapped.
    if (ef.paywallSeenThisWeek || paywallShownLocal) {
      toast("Already peeked at this this week — check back next week!");
      return;
    }
    setSheet("upgrade");
    setPaywallShownLocal(true);
    void markShown();
  }

  const activeScore = ef?.scores.find((s) => s.week_start === activeWeekStart) ?? null;
  const activeIndex = ef?.scores.findIndex((s) => s.week_start === activeWeekStart) ?? -1;
  const activePriorComposite = activeIndex >= 0 ? ef?.scores[activeIndex + 1]?.composite ?? null : null;

  async function handleRegenerate() {
    setBusy(true);
    try {
      const result = await regenerate();
      if ("generated" in result && result.generated === false) {
        toast(result.reason ?? "No activity this week yet.");
      } else {
        toast.success("Regenerated this week's report.");
        
        // Fire browser notification if permission granted
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Your week in mind", {
              body: "Your weekly reflection report is ready to view.",
              icon: "/logo.png",
              badge: "/logo.png",
              tag: "notio-weekly-report",
              requireInteraction: false,
            });
          } catch {
            // Some browsers/contexts throw; ignore
          }
        }
      }
      qc.invalidateQueries({ queryKey: ["weekly-report"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't regenerate.");
    } finally {
      setBusy(false);
    }
  }

  const reports = selectDisplayReports((data ?? []) as ReportRow[]);
  const [latestReport, ...previousReports] = reports;

  function renderReport(r: ReportRow, i = 0) {
          const wins = r.content?.wins ?? [];
          const focusAreas = r.content?.focus_areas ?? [];
          const completedCount = r.content?.completed_count ?? 0;
          const daysActive = r.content?.days_active ?? 0;
          const motivationalNote = r.content?.motivational_note;
          const zeroWeek = daysActive === 0 && wins.length === 0 && completedCount === 0;
          // weekly_reports.week_start is a rolling window ending on the user's report
          // day; ef_scores.week_start is always the ISO Monday (handoff §7). The two
          // dates almost never match exactly, so match by ISO week instead — using
          // week_end since that's the date closest to when both cron jobs actually ran.
          const efWeekKey = mondayKeyOf(r.week_end);
          const efScore = ef?.scores.find((s) => s.week_start === efWeekKey) ?? null;
          const efIndex = ef?.scores.findIndex((s) => s.week_start === efWeekKey) ?? -1;
          const efPriorComposite = efIndex >= 0 ? ef?.scores[efIndex + 1]?.composite ?? null : null;
          return (
          <motion.article
            key={r.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="space-y-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {formatReportRange(r.week_start, r.week_end)}
            </p>

            {efScore && (
              <EfWidget
                score={efScore}
                priorComposite={efPriorComposite}
                onTap={() => onWidgetTap(efWeekKey)}
              />
            )}

            {/* A small nudge — EF-driven, same as the Maps-screen card. Falls back
                to the old zero-week note when this week has no EF score. */}
            {(efScore?.nudge ?? (zeroWeek ? motivationalNote : null)) && (
              <div className="rounded-3xl border border-blue-500/40 bg-blue-500/10 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                  A small nudge
                </p>
                <p className="mt-2 text-sm text-foreground">
                  {efScore?.nudge ?? motivationalNote}
                </p>
              </div>
            )}

            {/* THIS WEEK'S MAP — wins as bright nodes */}
            {wins.length > 0 && (
              <div className="rounded-3xl bg-surface p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  This week&rsquo;s map
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 py-4">
                  {wins.slice(0, 8).map((w, idx) => (
                    <div
                      key={idx}
                      className="h-2.5 w-2.5 rounded-full bg-cyan shadow-[0_0_12px_2px_var(--color-cyan)]"
                      title={w}
                    />
                  ))}
                  {wins.length > 8 && (
                    <span className="text-xs font-medium text-muted-foreground">
                      +{wins.length - 8}
                    </span>
                  )}
                </div>
                <ul className="mt-4 space-y-1.5">
                  {wins.map((w, idx) => (
                    <li key={idx} className="text-sm text-foreground">
                      <span className="font-semibold text-cyan">{idx + 1}.</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* WHAT KEPT COMING UP — focus areas */}
            {focusAreas.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  What kept coming up
                </p>
                <div className="space-y-2.5">
                  {focusAreas.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-3xl bg-surface p-4"
                    >
                      <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-cyan" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{f.category}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{f.suggestion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WHAT YOU CLOSED — 3-column metrics */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                What you closed
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-3xl bg-surface p-5">
                  <p className="text-xs text-muted-foreground">Days active</p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-bold text-foreground">{daysActive}</span>
                    <span className="text-sm text-muted-foreground">/ 7</span>
                  </div>
                </div>
                <div className="rounded-3xl bg-surface p-5">
                  <p className="text-xs text-muted-foreground">Wins recorded</p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-bold text-foreground">{wins.length}</span>
                    <ArrowUpRight className="h-4 w-4 text-cyan" />
                  </div>
                </div>
                <div className="rounded-3xl bg-surface p-5">
                  <p className="text-xs text-muted-foreground">Tasks completed</p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-bold text-foreground">{completedCount}</span>
                    <ArrowUpRight className="h-4 w-4 text-cyan" />
                  </div>
                </div>
              </div>
            </div>

            {/* One reflection question */}
            {r.content?.reflection_question && (
              <div className="rounded-3xl bg-surface p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  One reflection question
                </p>
                <p className="mt-2 text-sm text-foreground">{r.content.reflection_question}</p>
              </div>
            )}

            {ef && (
              <PatternsWidget
                patterns={ef.patternsByWeek[efWeekKey] ?? []}
                isPro={ef.isPro}
                weeksOfHistory={ef.weeksOfHistory}
              />
            )}
          </motion.article>
          );
  }

  return (
    <div className="notiox-screen notiox-weekly-report mx-auto max-w-md px-6 pt-10 pb-28 lg:max-w-6xl lg:px-8">
      <Link
        to="/maps"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="notiox-report-page-heading mt-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Your week in mind</h1>
          <p className="mt-1 text-sm text-muted-foreground">A gentle look back at your week.</p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-cyan/15 px-4 py-2 text-xs font-semibold text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Regenerate
        </button>
      </div>

      {isLoading && (
        <div className="mt-10 flex items-center justify-center" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading reports...</span>
        </div>
      )}

      {isError && (
        <div className="notiox-report-error" role="alert">
          <p>{reports.length ? "Couldn't refresh your reports. Your last loaded reports are still here." : "Couldn't load your reports. Please try again."}</p>
          <button type="button" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            {isFetching ? "Retrying..." : "Try again"}
          </button>
        </div>
      )}

      {!isLoading && !isError && reports.length === 0 && (
        <div className="mt-12 rounded-3xl bg-surface p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No reports yet. Your first weekly reflection will appear here after your next report day.
          </p>
        </div>
      )}

      {latestReport && (
        <section className="notiox-latest-report" aria-labelledby="latest-report-heading">
          <h2 id="latest-report-heading">Latest report</h2>
          {renderReport(latestReport)}
        </section>
      )}

      {previousReports.length > 0 && (
        <section className="notiox-report-history" aria-labelledby="report-history-heading">
          <h2 id="report-history-heading">Previous reports</h2>
          <Accordion
            type="single"
            collapsible
            value={previousReports.some(report => report.id === expandedReport) ? expandedReport : ""}
            onValueChange={setExpandedReport}
          >
            {previousReports.map(report => {
              const wins = report.content?.wins?.length ?? 0;
              const tasks = report.content?.completed_count ?? 0;
              return (
                <AccordionItem key={report.id} value={report.id}>
                  <AccordionTrigger className="notiox-history-trigger">
                    <span>
                      <span className="notiox-history-date">{formatReportRange(report.week_start, report.week_end)}</span>
                      <span className="notiox-history-counts">
                        {wins} {wins === 1 ? "win" : "wins"} · {tasks} {tasks === 1 ? "task completed" : "tasks completed"}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="notiox-history-content">
                    {renderReport(report)}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </section>
      )}

      {/* One shared pair of sheets for the whole page — whichever week's widget
          was tapped decides which score/trend they show. */}
      {sheet === "detail" && activeScore && (
        <EfDetailSheet
          score={activeScore}
          trend={ef?.trend ?? []}
          priorComposite={activePriorComposite}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "upgrade" && activeScore && (
        <EfUpgradeSheet score={activeScore} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
