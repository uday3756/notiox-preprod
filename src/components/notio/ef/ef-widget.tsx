/**
 * EF widget — renders for EVERY user, free and Pro, identically.
 *
 * Handoff §3: widget shape, not card shape (bigger radius, more internal padding,
 * one dominant number). The track bar is the COMPOSITE ONLY — showing four
 * mini-bars here would give away the thing we're charging for. The affordance
 * string is identical for both tiers; we never advertise the lock on the widget.
 */
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { EfScoreRow } from "@/lib/ef/types";

export function EfWidget({
  score, priorComposite, onTap,
}: {
  score: EfScoreRow;
  priorComposite: number | null;
  onTap: () => void;
}) {
  const delta = priorComposite === null ? null : score.composite - priorComposite;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onTap}
      className="w-full rounded-[28px] border border-blue-500/40 bg-blue-500/10 p-6 text-left transition-colors hover:bg-blue-500/15"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
          Executive function
        </p>
        <ChevronRight className="h-4 w-4 text-blue-400" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-display text-6xl font-bold leading-none text-foreground">
          {score.composite}
        </span>
        <span className="text-sm text-muted-foreground">/100</span>
        {/* First week has no prior score: show an em dash, never a fabricated delta. */}
        <span className="text-sm font-semibold text-blue-400">
          {delta === null ? "—" : delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "—"}
        </span>
        <span className="ml-auto rounded-full bg-surface px-3 py-1 text-xs font-medium text-foreground">
          {score.archetype}
        </span>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-500"
          style={{ width: `${score.composite}%` }}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Tap to see what&rsquo;s behind it</p>
    </motion.button>
  );
}
