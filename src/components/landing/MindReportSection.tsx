import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Mind Report — count-up + 2.5D hover/tap (July 21 handoff §5).
 * No rotate3d. Reduced-motion: final values, no lifts.
 */

const METERS = [
  { label: "Consistency", value: 78 },
  { label: "Task initiation", value: 84 },
  { label: "Organization clarity", value: 71 },
];

const INSIGHTS = [
  { icon: "↑", text: "Thriving: Creative projects" },
  { icon: "→", text: "Steady: Admin & errands" },
  { icon: "◦", text: "Needs care: Sleep routine" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** Clarity points this week (marketing demo values) */
const WEEK_VALUES = [42, 55, 61, 70, 78, 82, 88];
const BAR_XS = [20, 100, 180, 260, 340, 420, 500];

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useCountUp(target: number, ms = 1200) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [v, setV] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setV(target);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min((t - t0) / ms, 1);
          setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, ms]);

  return { ref, v };
}

export function MindReportSection() {
  const circumference = 2 * Math.PI * 42;
  const score = 82;
  const { ref: scoreRef, v: scoreV } = useCountUp(score);
  const offset = circumference - (scoreV / 100) * circumference;

  const [hover, setHover] = useState<number | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);

  const nearestBar = useCallback((clientX: number) => {
    const svg = chartWrapRef.current?.querySelector("svg");
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 520;
    let best = 0;
    let bestDist = Infinity;
    BAR_XS.forEach((bx, i) => {
      const d = Math.abs(bx - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!chartWrapRef.current) return;
      const t = "touches" in e ? null : (e.target as Node);
      if (t && !chartWrapRef.current.contains(t)) setHover(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const tipI = hover;
  const tipX = tipI != null ? BAR_XS[tipI] : 0;
  const tipVal = tipI != null ? WEEK_VALUES[tipI] : 0;
  const tipY = tipI != null ? 160 - WEEK_VALUES[tipI] * 1.2 : 0;

  return (
    <section
      id="report"
      aria-label="Weekly Mind Report"
      className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6 sm:py-20 md:px-8 md:py-[130px]"
    >
      <p className="l-eyebrow px-2 text-center leading-relaxed">
        <span className="sm:hidden">Weekly Mind Report</span>
        <span className="hidden sm:inline">Executive Function Score · Weekly Mind Report</span>
      </p>
      <h2 className="l-display mx-auto mt-3 max-w-[720px] text-center text-[clamp(26px,7vw,42px)] leading-[1.15] sm:mt-4 sm:leading-[1.12]">
        See your mind get clearer, week over week.
      </h2>
      <p className="mx-auto mt-3 max-w-[560px] text-center text-[14.5px] leading-relaxed text-[var(--ink-muted)] sm:mt-4 sm:text-[15.5px]">
        Notio quietly tracks consistency, task-initiation velocity and organization clarity from
        your maps — then hands you one calm Sunday reflection, not another feed.
      </p>

      <div className="mt-8 grid gap-4 sm:mt-12 sm:gap-5 lg:grid-cols-2">
        {/* EF Score card — 2.5D lift, no rotate3d */}
        <div className="l-card report-card rounded-[16px] p-5 sm:rounded-[22px] sm:p-7 md:rounded-[26px] md:p-8">
          <p className="l-eyebrow layer-front">Executive Function Score</p>
          <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="layer-front relative h-[140px] w-[140px] shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line-1)" strokeWidth="7" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  ref={scoreRef}
                  className="l-display text-[40px] leading-none tabular-nums text-[var(--ink-strong)]"
                >
                  {scoreV}
                </span>
                <span className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  of 100
                </span>
              </div>
            </div>
            <div className="w-full flex-1">
              <p className="text-[13px] font-semibold text-[var(--accent)]">↑ +6 vs last week</p>
              <div className="mt-4 space-y-3.5">
                {METERS.map((m, i) => (
                  <MeterRow key={m.label} label={m.label} value={m.value} delay={i * 120} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart card */}
        <div
          ref={chartWrapRef}
          className="l-card report-card relative rounded-[16px] p-5 sm:rounded-[22px] sm:p-7 md:rounded-[26px] md:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="l-eyebrow">Clarity processed</p>
            <div className="flex gap-3 text-[11.5px] text-[var(--ink-faint)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-[var(--accent)]" /> This week
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-[var(--line-2)]" /> Last week
              </span>
            </div>
          </div>

          <div
            className="relative mt-5"
            onMouseMove={(e) => setHover(nearestBar(e.clientX))}
            onMouseLeave={() => setHover(null)}
          >
            <svg
              viewBox="0 0 520 210"
              className="w-full"
              role="img"
              aria-label="Clarity processed chart Mon through Sun. Tap a day for the value."
            >
              <polyline
                fill="none"
                stroke="rgba(214,228,238,0.22)"
                strokeWidth="2"
                points="20,140 100,120 180,130 260,95 340,110 420,80 500,90"
              />
              <defs>
                <linearGradient id="clarityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon
                fill="url(#clarityFill)"
                points="20,160 20,120 100,100 180,85 260,70 340,55 420,48 500,40 500,160"
              />
              <polyline
                className="l-draw"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="20,120 100,100 180,85 260,70 340,55 420,48 500,40"
              />

              {DAYS.map((d, i) => {
                const y = 160 - WEEK_VALUES[i] * 1.2;
                const active = hover === i;
                const muted = hover != null && hover !== i;
                return (
                  <g
                    key={d}
                    className={`cursor-pointer transition-opacity duration-200 motion-reduce:transition-none ${
                      muted ? "opacity-60" : "opacity-100"
                    }`}
                    style={
                      active && !prefersReducedMotion()
                        ? { transform: "translateY(-4px)" }
                        : undefined
                    }
                    onClick={() => setHover(i)}
                  >
                    <circle
                      cx={BAR_XS[i]}
                      cy={y}
                      r={active ? 7 : 5}
                      fill={active ? "var(--accent)" : "#101828"}
                      stroke={active ? "#4D8DFF" : "rgba(255,255,255,0.2)"}
                      strokeWidth={active ? 2.5 : 1.5}
                      style={
                        active
                          ? { filter: "drop-shadow(0 4px 10px rgba(77,141,255,0.45))" }
                          : undefined
                      }
                    />
                    <text
                      x={BAR_XS[i]}
                      y={190}
                      fill="rgba(214,228,238,0.45)"
                      fontSize="11"
                      textAnchor="middle"
                    >
                      {d}
                    </text>
                    {/* larger tap target */}
                    <rect x={BAR_XS[i] - 28} y={30} width={56} height={150} fill="transparent" />
                  </g>
                );
              })}
            </svg>

            {/* Tooltip always rendered */}
            <div
              className={`pointer-events-none absolute z-[2] -translate-x-1/2 rounded-lg border border-[var(--line-2)] bg-[#101828] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink)] shadow-lg transition-all duration-200 motion-reduce:transition-none ${
                tipI != null ? "scale-100 opacity-100" : "scale-95 opacity-0"
              }`}
              style={{
                left: `${(tipX / 520) * 100}%`,
                top: `${Math.max(8, (tipY / 210) * 100 - 12)}%`,
              }}
              aria-hidden={tipI == null}
            >
              {tipI != null ? `${DAYS[tipI]}: ${tipVal}` : ""}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {INSIGHTS.map((ins) => (
              <span
                key={ins.text}
                className="l-chip rounded-xl px-3 py-2 text-[12.5px] text-[var(--ink-muted)]"
              >
                <span className="mr-1.5 text-[var(--accent)]">{ins.icon}</span>
                {ins.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MeterRow({ label, value, delay }: { label: string; value: number; delay: number }) {
  const { ref, v } = useCountUp(value, 1200);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[12.5px]">
        <span className="text-[var(--ink-muted)]">{label}</span>
        <span ref={ref} className="font-semibold tabular-nums text-[var(--ink)]">
          {v}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="l-meter-fill h-full rounded-full bg-[var(--accent)]"
          style={{
            width: `${v}%`,
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}
