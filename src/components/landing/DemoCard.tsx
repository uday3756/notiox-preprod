/**
 * Interactive demo card — left: talk; right: clickable mind-map preview.
 * July 21 handoff §4.
 */
import { MindMapPreview } from "@/components/landing/MindMapPreview";

const THOUGHTS = [
  "need to finish the deck before Friday…",
  "also call the dentist, and maybe",
  "the rent math again — wait",
  "oh and that certification exam",
];

export function DemoCard() {
  return (
    <section
      id="demo"
      aria-label="How it works"
      className="mx-auto max-w-[1104px] px-4 sm:px-6 md:px-8"
    >
      <div className="l-card overflow-hidden rounded-[16px] sm:rounded-[22px] md:rounded-[26px]">
        <div className="grid md:grid-cols-2">
          {/* 01 — You talk */}
          <div className="relative border-b border-[var(--line-1)] p-5 sm:p-6 md:border-b-0 md:border-r md:p-8">
            <p className="l-eyebrow">01 · You talk</p>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-2.5">
              {THOUGHTS.map((t, i) => (
                <span
                  key={t}
                  className={`l-chip l-chip-drift rounded-xl px-2.5 py-1.5 text-[12px] italic leading-snug text-[var(--ink-muted)] sm:px-3 sm:py-2 sm:text-[13px] ${
                    i >= 2 ? "max-[479px]:hidden" : ""
                  }`}
                  style={{ animationDelay: `${i * 400}ms`, animationDuration: `${7 + i * 0.4}s` }}
                >
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10 sm:gap-4">
              <div
                className="l-mic-pulse flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] sm:h-16 sm:w-16"
                aria-hidden
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <path d="M12 18v3" />
                </svg>
              </div>
              <div className="flex h-10 items-end gap-[3px]" aria-hidden>
                {Array.from({ length: 16 }).map((_, i) => (
                  <span
                    key={i}
                    className="l-wave-bar w-[3px] rounded-full bg-[var(--accent)]"
                    style={{
                      height: `${10 + ((i * 7) % 22)}px`,
                      animationDelay: `${i * 90}ms`,
                    }}
                  />
                ))}
              </div>
              <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                listening…
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center border-b border-[var(--line-1)] bg-[var(--surface-2)] py-3 md:hidden">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              seconds later
            </span>
          </div>

          {/* 02 — Notio maps (interactive) */}
          <div className="relative p-5 sm:p-6 md:p-8">
            <div className="absolute left-0 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
              <span className="inline-block rotate-[-90deg] whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                seconds later
              </span>
            </div>
            <p className="l-eyebrow">02 · Notio maps</p>
            <div className="relative mx-auto mt-2 min-h-[280px] w-full sm:mt-3 sm:min-h-[320px]">
              <MindMapPreview />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
