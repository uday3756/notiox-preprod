/**
 * EF detail sheet — Pro only.
 *
 * Handoff §4: a bottom sheet over the weekly section, not a new page. The
 * composite repeats at the top so the tap feels like a zoom, not a jump to a
 * different object. The sparkline is the only chart in the feature and is one
 * tap deep, never on the main scroll.
 *
 * Tapping a pillar row swaps the body for that pillar's plain-language definition
 * and its single "what moves this" line. That is the floor — nothing goes deeper.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { addDays, format } from "date-fns";
import { PILLAR_LABELS, PILLAR_COPY, type EfScoreRow, type PillarKey } from "@/lib/ef/types";

const ORDER: PillarKey[] = ["initiation", "simplicity", "wins", "winddown"];

export function EfDetailSheet({
  score, trend, priorComposite = null, onClose,
}: {
  score: EfScoreRow;
  trend: number[];
  priorComposite?: number | null;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<PillarKey | null>(null);

  const delta = priorComposite === null ? null : score.composite - priorComposite;

  // "JUL 26 – AUG 1, 2026" — week_start is the Monday, so the week ends +6 days.
  const start = new Date(`${score.week_start}T00:00:00`);
  const weekRange = `${format(start, "MMM d")} – ${format(addDays(start, 6), "MMM d, yyyy")}`;

  const valueOf = (k: PillarKey): number | null =>
    k === "initiation" ? score.p_initiation
      : k === "simplicity" ? score.p_simplicity
        : k === "wins" ? score.p_wins
          : score.p_winddown;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-[28px] bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-display text-5xl font-bold leading-none text-foreground">
            {score.composite}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
          {delta !== null && (
            <span className="text-sm font-semibold text-blue-400">
              {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "—"}
            </span>
          )}
          <span className="ml-auto rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-400">
            {score.archetype}
          </span>
        </div>

        {/* Week range, per the mock — sits directly under the composite. */}
        <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {weekRange}
        </p>

        {open ? (
          <div className="mt-6">
            <button onClick={() => setOpen(null)} className="text-xs font-semibold text-blue-400">
              ← All pillars
            </button>
            <h3 className="mt-3 font-display text-xl font-bold text-foreground">
              {PILLAR_LABELS[open]}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">{PILLAR_COPY[open].definition}</p>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
              What moves this
            </p>
            <p className="mt-1 text-sm text-foreground">{PILLAR_COPY[open].moves}</p>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-4">
              {ORDER.map((k) => {
                const v = valueOf(k);

                // scoring_version 1 excludes Task initiation (handoff §9). Show the
                // row so the shape is honest, but greyed and not tappable.
                if (v === null) {
                  return (
                    <div key={k} className="opacity-40">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{PILLAR_LABELS[k]}</span>
                        <span className="text-xs text-muted-foreground">Coming soon</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-background" />
                    </div>
                  );
                }

                return (
                  <button key={k} onClick={() => setOpen(k)} className="block w-full text-left">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{PILLAR_LABELS[k]}</span>
                      <span className="font-semibold text-foreground">{v}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${v}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            {trend.length > 1 && (
              <div className="mt-6 rounded-2xl bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {trend.length}-week trend
                </p>
                <svg viewBox="0 0 100 30" className="mt-2 h-12 w-full" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke="#60A5FA"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    points={trend
                      .map((v, i) => `${(i / (trend.length - 1)) * 100},${30 - (v / 100) * 30}`)
                      .join(" ")}
                  />
                </svg>
              </div>
            )}

            {score.nudge && (
              <>
                <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                  What moves this next
                </p>
                <p className="mt-1 text-sm text-foreground">{score.nudge}</p>
              </>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
