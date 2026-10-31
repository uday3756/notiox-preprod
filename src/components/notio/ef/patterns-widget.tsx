/**
 * Patterns widget — sits below "One reflection question", above the date stamp.
 *
 * Handoff §6: hard caps of 2 "Working for you" + 1 "Worth trying". Free sees one
 * "Working for you" item only; Pro sees the full set. Below 3 weeks of history we
 * render an invitation, never an empty state.
 *
 * The bodies are already topic-filtered server-side before storage — this
 * component only lays them out.
 */
import type { PatternItem } from "@/lib/ef/types";

const MIN_WEEKS = 3;

export function PatternsWidget({
  patterns, isPro, weeksOfHistory,
}: {
  patterns: PatternItem[];
  isPro: boolean;
  weeksOfHistory: number;
}) {
  if (weeksOfHistory < MIN_WEEKS) {
    return (
      <div className="rounded-3xl bg-surface p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Patterns forming
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Patterns start showing up after about three weeks.
        </p>
      </div>
    );
  }

  const working = patterns.filter((p) => p.kind === "working").slice(0, 2);
  const shownWorking = isPro ? working : working.slice(0, 1);
  const worthTrying = isPro
    ? patterns.filter((p) => p.kind === "worth_trying").slice(0, 1)
    : [];

  if (!shownWorking.length && !worthTrying.length) return null;

  return (
    <div className="rounded-3xl border border-cyan/40 bg-surface p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">
        Patterns forming
      </p>

      {shownWorking.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-foreground">Working for you</p>
          <ul className="mt-2 space-y-2">
            {shownWorking.map((p, i) => (
              <li key={`w-${i}`} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan" />
                {p.body}
              </li>
            ))}
          </ul>
        </div>
      )}

      {worthTrying.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-foreground">Worth trying</p>
          <ul className="mt-2 space-y-2">
            {worthTrying.map((p, i) => (
              <li key={`t-${i}`} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan" />
                {p.body}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
