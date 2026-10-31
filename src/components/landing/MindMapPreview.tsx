import { useState, useCallback } from "react";
import { X } from "lucide-react";

/**
 * Interactive mind-map preview (July 21 handoff §4).
 * Click/tap a branch → zoom + detail card. DEMO copy drafted for Julian review.
 */

type DemoNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  task: string;
  coach: string;
};

const DEMO = {
  center: "everything in my head rn",
  nodes: [
    {
      id: "bday",
      label: "sister's birthday",
      x: -160,
      y: -70,
      task: "Book a table at Rosa's for Saturday",
      coach: "You close social tasks fastest same-day — knock this one out first.",
    },
    {
      id: "rent",
      label: "email landlord",
      x: 170,
      y: -55,
      task: "Send rent clarification email with the receipt attached",
      coach: "Short admin tasks stick when you start them in under two minutes.",
    },
    {
      id: "study",
      label: "bio exam friday",
      x: -120,
      y: 110,
      task: "Review chapters 4–6 with a 25-minute focus block tonight",
      coach: "Exam stress drops when the next step is timed and tiny.",
    },
    {
      id: "gym",
      label: "back day",
      x: 150,
      y: 120,
      task: "Pack gym bag and block 45 minutes after work",
      coach: "Movement clears the map — schedule it before the evening scroll.",
    },
  ] as DemoNode[],
};

const CENTER = { x: 0, y: 0 };

export function MindMapPreview() {
  const [active, setActive] = useState<DemoNode | null>(null);

  const clear = useCallback(() => setActive(null), []);

  // When a node is open, zoom toward it and shift the map up so nodes stay above the card.
  const zoom = active
    ? `translate(${-active.x * 0.55}px, ${-active.y * 0.55 - 70}px) scale(1.35)`
    : "translate(0, 0) scale(1)";

  return (
    <div
      className={`relative ${active ? "pb-40 sm:pb-44" : "pb-2"}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") clear();
      }}
    >
      <p
        className={`pointer-events-none absolute inset-x-0 top-1 z-[1] text-center text-[11.5px] text-[var(--ink-faint)] transition-opacity sm:text-[12.5px] ${
          active ? "opacity-0" : "opacity-100"
        }`}
      >
        Tap any branch to explore
      </p>

      <svg
        viewBox="-260 -180 520 360"
        className="w-full"
        role="img"
        aria-label="Interactive mind map preview. Tap a branch to explore."
      >
        <g className="l-map-zoom origin-center" style={{ transform: zoom }}>
          {DEMO.nodes.map((n) => (
            <line
              key={`link-${n.id}`}
              x1={CENTER.x}
              y1={CENTER.y}
              x2={n.x}
              y2={n.y}
              stroke="var(--accent)"
              strokeOpacity={active && active.id !== n.id ? 0.15 : 0.45}
              strokeWidth="1.5"
              className="transition-opacity duration-300 motion-reduce:transition-none"
            />
          ))}

          <g
            tabIndex={0}
            role="button"
            aria-label="Center node — reset view"
            className="cursor-pointer outline-none focus-visible:opacity-90"
            onClick={clear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                clear();
              }
            }}
          >
            <circle cx={0} cy={0} r={48} fill="#101828" stroke="var(--accent)" strokeWidth="2.5" />
            <text textAnchor="middle" y={4} fill="#eaf2f8" fontSize="11" fontWeight="600">
              {DEMO.center.split(" ").slice(0, 2).join(" ")}
            </text>
            <text textAnchor="middle" y={18} fill="rgba(214,228,238,0.6)" fontSize="10">
              {DEMO.center.split(" ").slice(2).join(" ")}
            </text>
          </g>

          {DEMO.nodes.map((n) => {
            const dimmed = Boolean(active && active.id !== n.id);
            const selected = active?.id === n.id;
            return (
              <g
                key={n.id}
                tabIndex={0}
                role="button"
                aria-label={`Explore ${n.label}`}
                aria-pressed={selected}
                transform={`translate(${n.x}, ${n.y})`}
                className={`cursor-pointer outline-none transition-opacity duration-300 motion-reduce:transition-none focus-visible:opacity-100 ${
                  dimmed ? "opacity-30" : "opacity-100"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(n);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(n);
                  }
                }}
              >
                <circle
                  r={34}
                  fill="#101828"
                  strokeWidth="2"
                  stroke={selected ? "#4D8DFF" : "rgba(255,255,255,0.13)"}
                />
                <text textAnchor="middle" dy="4" fill="#ffffff" fontSize="10.5" fontWeight="500">
                  {n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Detail card always rendered; reserved bottom padding prevents node overlap */}
      <div
        className={`absolute inset-x-0 bottom-0 z-[2] transition-all duration-300 motion-reduce:transition-none ${
          active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
        aria-hidden={!active}
      >
        <div className="l-card mx-1 rounded-2xl border border-[var(--line-2)] p-4 sm:mx-2 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--ink-strong)]">
                {active?.label ?? ""}
              </p>
              <p className="mt-2 text-[12px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                Your task
              </p>
              <p className="mt-1 text-[14px] leading-snug text-[var(--ink)]">{active?.task ?? ""}</p>
              <p className="mt-3 text-[13.5px] leading-snug text-[var(--accent)]">
                {active?.coach ?? ""}
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line-1)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              aria-label="Close node detail"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
