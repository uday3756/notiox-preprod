import { Link } from "@tanstack/react-router";

/**
 * Landing footer — mobile-first stack, clean logo (no double frame).
 * Social links live here only (public landing), not in the signed-in app.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--line-1)]">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-8 sm:px-6 sm:py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-start gap-3">
          <img
            src="/logo.png"
            alt="Notio"
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-[10px] object-cover"
          />
          <div className="min-w-0">
            <p className="l-display text-[14px] tracking-[0.08em]">NOTIO</p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
              The voice-first mind mapping app for ADHD &amp; fast-thinking minds.
            </p>
          </div>
        </div>

        <nav
          className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--ink-muted)]"
          aria-label="Legal"
        >
          <Link to="/privacy-policy" className="min-h-11 inline-flex items-center hover:text-[var(--ink)]">
            Privacy
          </Link>
          <Link to="/terms" className="min-h-11 inline-flex items-center hover:text-[var(--ink)]">
            Terms
          </Link>
          <a
            href="mailto:hello@notio.app"
            className="min-h-11 inline-flex items-center hover:text-[var(--ink)]"
          >
            Contact
          </a>
        </nav>
      </div>

      <div className="border-t border-[var(--line-1)] px-4 py-5 text-center sm:px-6">
        <nav
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--ink-muted)]"
          aria-label="Social"
        >
          <a
            href="https://www.linkedin.com/company/notiolive/about/"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 inline-flex items-center hover:text-[var(--ink)]"
          >
            LinkedIn
          </a>
          <a
            href="https://www.instagram.com/notioliveproductivity?igsh=dmczNmxuOTE4eDBl"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 inline-flex items-center hover:text-[var(--ink)]"
          >
            Instagram
          </a>
        </nav>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--ink-faint)] sm:text-[12px]">
          © {new Date().getFullYear()} Notio. Speak freely — we&rsquo;ll keep up.
        </p>
      </div>
    </footer>
  );
}
