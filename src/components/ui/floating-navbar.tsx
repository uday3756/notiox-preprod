/**
 * Scroll-aware floating nav — placement by breakpoint:
 *
 *  Desktop (md+): top center pill when scrolling UP mid-page
 *  Mobile:        bottom dock (never overlaps sticky header + ☰)
 *
 * Why bottom on mobile:
 *  - Top is already owned by logo + menu toggle
 *  - Thumbs reach the bottom naturally
 *  - Safe-area inset for home indicator
 */
import { useState, type ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type FloatingNavItem = {
  name: string;
  link: string;
  icon?: ReactNode;
};

export function FloatingNav({
  navItems,
  className,
  ctaLabel = "Start free",
  ctaTo = "/auth",
}: {
  navItems: FloatingNavItem[];
  className?: string;
  ctaLabel?: string;
  ctaTo?: string;
}) {
  const { scrollYProgress } = useScroll();
  /** Desktop top pill — visible when scrolling up mid-page */
  const [showDesktop, setShowDesktop] = useState(false);
  /** Mobile bottom dock — stays up once past the top of the page */
  const [showMobile, setShowMobile] = useState(false);

  useMotionValueEvent(scrollYProgress, "change", (current) => {
    if (typeof current !== "number") return;
    const previous = scrollYProgress.getPrevious() ?? 0;
    const direction = current - previous;
    const y = scrollYProgress.get();

    if (y < 0.03) {
      setShowDesktop(false);
      setShowMobile(false);
      return;
    }
    setShowMobile(true);
    setShowDesktop(direction < 0);
  });

  return (
    <>
      {/* ── Desktop: top floating pill ─────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0, y: -80 }}
          animate={{
            y: showDesktop ? 0 : -80,
            opacity: showDesktop ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
          className={cn(
            "pointer-events-none fixed inset-x-0 top-5 z-[5000] mx-auto hidden max-w-fit justify-center md:flex",
            className,
          )}
        >
          <div
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--line-2)] bg-[color-mix(in_srgb,var(--canvas)_78%,transparent)] px-2 py-1.5 shadow-[0_0_40px_-10px_var(--glow-c)] backdrop-blur-md",
              !showDesktop && "pointer-events-none",
            )}
          >
            <div className="flex items-center gap-1">
              {navItems.map((navItem, idx) => (
                <a
                  key={`desk-${idx}`}
                  href={navItem.link}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                >
                  {navItem.name}
                </a>
              ))}
            </div>
            <div className="h-5 w-px bg-[var(--line-2)]" aria-hidden />
            <Link
              to={ctaTo}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--on-accent)] shadow-[0_0_24px_-6px_var(--glow-c)] transition-transform hover:-translate-y-0.5"
            >
              {ctaLabel}
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Mobile: bottom dock for section jumps ──────────────── */}
      <AnimatePresence>
        {showMobile && (
          <motion.nav
            key="mobile-dock"
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            aria-label="Quick navigation"
            className={cn(
              "fixed inset-x-0 bottom-0 z-[5000] px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] md:hidden",
              className,
            )}
          >
            <div className="mx-auto flex max-w-md items-center gap-1 rounded-[22px] border border-[var(--line-2)] bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] p-1.5 shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.75),0_0_40px_-12px_var(--glow-c)] backdrop-blur-xl">
              {navItems.map((navItem, idx) => (
                <a
                  key={`mob-${idx}`}
                  href={navItem.link}
                  className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[var(--ink-muted)] transition-colors active:bg-[var(--surface-2)] active:text-[var(--accent)]"
                >
                  <span className="text-[var(--accent)]">{navItem.icon}</span>
                  <span className="max-w-full truncate text-[9.5px] font-medium leading-none tracking-wide">
                    {navItem.name}
                  </span>
                </a>
              ))}
              <Link
                to={ctaTo}
                className="ml-0.5 flex h-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] px-3.5 text-[12px] font-semibold text-[var(--on-accent)] shadow-[0_0_20px_-4px_var(--glow-c)]"
              >
                Free
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}
