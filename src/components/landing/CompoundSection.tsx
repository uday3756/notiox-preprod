/**
 * Compounding loop — streak strip + Week 1 / 4 / 12 map tiles.
 * Handoff §7; stacks to 1 col ≤1023px.
 */

const WEEKS = [
  {
    label: "Week 1",
    title: "Scattered",
    blurb: "Raw dumps. Nodes everywhere. The shape of a busy mind.",
    nodes: 5,
  },
  {
    label: "Week 4",
    title: "Clustering",
    blurb: "Themes emerge. Notio starts grouping how you actually think.",
    nodes: 8,
  },
  {
    label: "Week 12",
    title: "Sharpened",
    blurb: "Cleaner maps, your vocabulary, your shortcuts — more you.",
    nodes: 12,
  },
];

export function CompoundSection() {
  return (
    <section
      id="compound"
      aria-label="The compounding loop"
      className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6 sm:pb-20 md:px-8 md:pb-[130px]"
    >
      <p className="l-eyebrow text-center">The compounding loop</p>
      <h2 className="l-display mx-auto mt-3 max-w-[720px] text-center text-[clamp(26px,7vw,42px)] leading-[1.15] sm:mt-4 sm:leading-[1.12]">
        Your maps sharpen with your mind.
      </h2>
      <p className="mx-auto mt-3 max-w-[640px] text-center text-[14.5px] leading-relaxed text-[var(--ink-muted)] sm:mt-4 sm:text-[15.5px]">
        Notio learns your vocabulary, your patterns, the shortcuts your brain takes. Every
        week of use, your maps come back sharper, cleaner and more you — the longer you
        think with it, the better it thinks with you.
      </p>

      {/* Streak strip — dots always horizontal; caption wraps below on narrow screens */}
      <div className="l-card mx-auto mt-8 flex max-w-[720px] flex-row flex-wrap items-center justify-center gap-1.5 rounded-[16px] px-4 py-4 sm:mt-10 sm:rounded-[20px] sm:px-5">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
            style={{
              background:
                i < 9
                  ? `color-mix(in srgb, var(--accent) ${40 + i * 5}%, transparent)`
                  : "var(--surface-2)",
            }}
            aria-hidden
          />
        ))}
        <p className="mt-2 w-full text-center text-[12px] leading-snug text-[var(--ink-faint)] sm:ml-3 sm:mt-0 sm:w-auto sm:text-[12.5px]">
          Week 9 of your streak. Every week teaches Notio more of your brain&rsquo;s shorthand.
        </p>
      </div>

      {/* Week tiles */}
      <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-5 md:grid-cols-3">
        {WEEKS.map((w, i) => (
          <article
            key={w.label}
            className="l-card l-hover-lift rounded-[16px] p-5 sm:rounded-[20px] sm:p-6"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <p className="l-eyebrow">{w.label}</p>
            <div
              className="relative mx-auto mt-5 w-full"
              style={{ aspectRatio: "1 / 0.72" }}
              aria-hidden
            >
              <MiniMap count={w.nodes} />
            </div>
            <h3 className="l-display mt-4 text-[20px]">{w.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-muted)]">
              {w.blurb}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MiniMap({ count }: { count: number }) {
  // Deterministic pseudo-positions so SSR + client match.
  const nodes = Array.from({ length: count }).map((_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const r = 28 + (i % 3) * 8;
    return {
      x: 50 + Math.cos(angle) * r,
      y: 50 + Math.sin(angle) * r,
    };
  });
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {nodes.map((n, i) => (
        <line
          key={`l-${i}`}
          x1="50"
          y1="50"
          x2={n.x}
          y2={n.y}
          stroke="var(--accent)"
          strokeOpacity="0.35"
          strokeWidth="0.6"
        />
      ))}
      <circle cx="50" cy="50" r="5" fill="var(--accent)" className="l-node-breathe" />
      {nodes.map((n, i) => (
        <circle
          key={`n-${i}`}
          cx={n.x}
          cy={n.y}
          r="2.8"
          fill="var(--ink)"
          fillOpacity="0.75"
        />
      ))}
    </svg>
  );
}
