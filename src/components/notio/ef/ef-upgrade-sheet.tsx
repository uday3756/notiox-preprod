/**
 * EF upgrade sheet — free tier.
 *
 * Handoff §4: blur the REAL numbers, don't fake them. The user's own data behind
 * the glass converts better than a generic marketing panel — and it's true.
 *
 * The footer line is required: removing nothing they already had is the difference
 * between a paywall and a downgrade.
 */
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PILLAR_LABELS, type EfScoreRow, type PillarKey } from "@/lib/ef/types";

const ORDER: PillarKey[] = ["initiation", "simplicity", "wins", "winddown"];

export function EfUpgradeSheet({ score, onClose }: { score: EfScoreRow; onClose: () => void }) {
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
        className="relative w-full overflow-hidden rounded-t-[28px] bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 z-20 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Real values, blurred. Never mocked. */}
        <div
          className="pointer-events-none select-none"
          style={{ filter: "blur(3.5px)", opacity: 0.45 }}
          aria-hidden
        >
          <div className="flex items-center gap-3">
            <span className="font-display text-5xl font-bold leading-none text-foreground">
              {score.composite}
            </span>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
          <div className="mt-6 space-y-4">
            {ORDER.map((k) => {
              const v = valueOf(k);
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{PILLAR_LABELS[k]}</span>
                    <span className="font-semibold text-foreground">{v ?? "--"}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${v ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Offer sits over the glass. */}
        <div className="absolute inset-x-0 bottom-0 top-16 z-10 flex flex-col items-center justify-center px-8 text-center">
          <h3 className="font-display text-xl font-bold text-foreground">
            See what&rsquo;s behind your {score.composite}
          </h3>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Pro opens the four parts of your score, the four-week trend, and the one thing that
            moves it next.
          </p>
          <Link
            to="/pricing"
            className="mt-5 rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-background"
          >
            Upgrade to Pro &middot; $12/mo
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">
            Your score and weekly report stay free.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
