/**
 * Hero — mobile-first spacing + typography.
 * Handoff: drop the <br> on small screens; CTAs full-width (max 340px).
 */
export function LandingHero() {
  return (
    <section
      id="top"
      aria-label="Hero"
      className="mx-auto max-w-[1080px] px-4 pb-16 pt-10 text-center sm:px-6 sm:pb-20 sm:pt-14 md:px-8 md:pb-[130px] md:pt-24"
    >
      <p
        className="l-fade-up l-chip mx-auto inline-flex max-w-[min(100%,22rem)] items-center justify-center rounded-full px-3 py-1.5 text-center text-[10.5px] font-semibold uppercase leading-snug tracking-[0.14em] text-[var(--accent)] sm:max-w-none sm:px-3.5 sm:text-[11.5px] sm:tracking-[0.18em]"
        style={{ animationDelay: "0ms" }}
      >
        Voice-first mind maps for ADHD &amp; fast minds
      </p>

      <h1
        className="l-fade-up l-display mx-auto mt-5 max-w-[920px] text-[clamp(32px,8.5vw,48px)] leading-[1.08] sm:mt-7 md:text-[clamp(50px,5.6vw,78px)] md:leading-[1.05]"
        style={{ animationDelay: "60ms" }}
      >
        Your ideas arrive faster
        <br className="hidden md:block" />{" "}
        than you can write them.
      </h1>

      <p
        className="l-fade-up mx-auto mt-5 max-w-[34rem] text-[15.5px] leading-[1.65] text-[var(--ink-muted)] sm:mt-6 sm:text-[17.5px] sm:leading-[1.7]"
        style={{ animationDelay: "120ms" }}
      >
        When your brain outruns your hands, just speak. Notio captures your unfiltered
        voice and structures it into interactive mind maps—mental chaos into visual clarity.
      </p>

      <div
        className="l-fade-up mx-auto mt-8 flex w-full max-w-[320px] flex-col items-stretch gap-2.5 sm:mt-10 sm:max-w-none sm:flex-row sm:justify-center sm:gap-3"
        style={{ animationDelay: "180ms" }}
      >
        <a
          href="#demo"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3.5 text-[14.5px] font-semibold text-[var(--on-accent)] transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-11 sm:px-7 sm:text-[15px]"
        >
          Capture Your First Thought
        </a>
        <a
          href="#demo"
          className="l-hover-lift inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--surface-1)] px-6 py-3.5 text-[14.5px] font-semibold text-[var(--ink)] sm:min-h-11 sm:px-7 sm:text-[15px]"
        >
          See How It Works
        </a>
      </div>

      <p
        className="l-fade-up mt-4 text-[12.5px] text-[var(--ink-faint)] sm:mt-5 sm:text-[13px]"
        style={{ animationDelay: "240ms" }}
      >
        No account. No setup. Just talk.
      </p>
    </section>
  );
}
