import { useEffect, useMemo, useState } from "react";
import {
  BLOCK_ORDER,
  RING_COLORS,
  RING_GAPS,
  RING_RADII,
  RING_STROKE,
  RING_TRACK,
  RING_TRACK_ACTIVE,
  RING_VIEWBOX,
  estimateSplit,
  ringCapacity,
  segmentPath,
  type TimeBlock,
} from "@/lib/rings/geometry";

export type RingProgress = Record<
  TimeBlock,
  { completed: number; capacity: number; assigned: number }
>;

type Props = {
  progress: RingProgress;
  activeBlock?: TimeBlock;
  celebrate?: boolean;
  onCelebrateDone?: () => void;
};

export function DailyRings({
  progress,
  activeBlock,
  celebrate = false,
  onCelebrateDone,
}: Props) {
  const [pulse, setPulse] = useState(false);

  const totals = useMemo(() => {
    let completed = 0;
    let capacity = 0;
    for (const b of BLOCK_ORDER) {
      completed += progress[b].completed;
      capacity += progress[b].capacity;
    }
    return { completed, capacity };
  }, [progress]);

  const allFull = BLOCK_ORDER.every(
    (b) => progress[b].capacity > 0 && progress[b].completed >= progress[b].capacity,
  );

  useEffect(() => {
    if (!celebrate || !allFull) return;
    setPulse(true);
    const t = window.setTimeout(() => {
      setPulse(false);
      onCelebrateDone?.();
    }, 620);
    return () => window.clearTimeout(t);
  }, [celebrate, allFull, onCelebrateDone]);

  return (
    <div className="notiox-daily-rings relative mx-auto w-full max-w-[320px]">
      <svg
        viewBox={RING_VIEWBOX}
        className="h-auto w-full"
        style={{
          transformOrigin: "50% 50%",
          transform: pulse ? "scale(1.035)" : "scale(1)",
          transition: "transform 620ms ease-out",
        }}
        aria-label={`${totals.completed} of ${totals.capacity} done`}
      >
        {BLOCK_ORDER.map((block, ringIndex) => {
          const { completed, capacity } = progress[block];
          const cap = Math.max(1, capacity);
          const step = 360 / cap;
          const gap = RING_GAPS[ringIndex];
          const radius = RING_RADII[ringIndex];
          const color = RING_COLORS[ringIndex];
          const track = block === activeBlock ? RING_TRACK_ACTIVE : RING_TRACK;
          return (
            <g key={block}>
              {Array.from({ length: cap }, (_, i) => {
                const start = i * step + gap / 2;
                const end = (i + 1) * step - gap / 2;
                const filled = i < completed;
                return (
                  <path
                    key={`${block}-${i}`}
                    d={segmentPath(radius, start, end)}
                    fill="none"
                    stroke={filled ? color : track}
                    strokeWidth={RING_STROKE}
                    strokeLinecap="butt"
                  />
                );
              })}
            </g>
          );
        })}

        {allFull && celebrate ? (
          <g>
            <text
              x="130"
              y="122"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="28"
              fontWeight="600"
            >
              ✓
            </text>
            <text
              x="130"
              y="148"
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              fontSize="13"
              fontWeight="500"
            >
              Day complete
            </text>
          </g>
        ) : (
          <g>
            <text
              x="130"
              y="126"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="46"
              fontWeight="500"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {totals.completed}
            </text>
            <text
              x="130"
              y="152"
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontSize="14"
            >
              of {totals.capacity} done
            </text>
          </g>
        )}
      </svg>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {BLOCK_ORDER.map((block, i) => {
          const { completed, capacity } = progress[block];
          const color = RING_COLORS[i];
          const isActive = block === activeBlock;
          const isFull = capacity > 0 && completed >= capacity;
          return (
            <div
              key={block}
              className={`rounded-xl border px-2.5 py-2 ${
                isActive ? "border-primary/40 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: color }}
                  />
                  <span className="truncate text-[11px] font-medium capitalize">{block}</span>
                </span>
                {isActive && (
                  <span className="shrink-0 text-[9px] uppercase tracking-wide text-primary">
                    now
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={isFull ? { color } : undefined}
                >
                  {completed}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">/ {capacity}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function buildRingProgress(
  dailyEstimate: number,
  nodes: Array<{ time_block: TimeBlock | null; done: boolean }>,
): RingProgress {
  const [mEst, aEst, eEst] = estimateSplit(dailyEstimate);
  const estimates: Record<TimeBlock, number> = {
    morning: mEst,
    afternoon: aEst,
    evening: eEst,
  };

  const out = {} as RingProgress;
  for (const block of BLOCK_ORDER) {
    const assigned = nodes.filter((n) => n.time_block === block);
    const completed = assigned.filter((n) => n.done).length;
    out[block] = {
      assigned: assigned.length,
      completed,
      capacity: ringCapacity(estimates[block], assigned.length, completed),
    };
  }
  return out;
}
