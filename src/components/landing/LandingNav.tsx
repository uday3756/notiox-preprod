import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Mic, ChartColumn, Network, Play, Tag } from "lucide-react";
import { HoveredLink, Menu, MenuItem, ProductItem } from "@/components/ui/navbar-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const MOBILE_LINKS = [
  {
    href: "#demo",
    label: "Voice → Map",
    hint: "Speak. Notio builds the map.",
    icon: Mic,
  },
  {
    href: "#demo-video",
    label: "Walkthrough",
    hint: "90 seconds. First thought → map.",
    icon: Play,
  },
  {
    href: "#report",
    label: "Mind Report",
    hint: "Sunday reflection. EF score.",
    icon: ChartColumn,
  },
  {
    href: "#compound",
    label: "Compounding loop",
    hint: "Maps get sharper every week.",
    icon: Network,
  },
  {
    href: "#pricing",
    label: "Pricing",
    hint: "Free · $12 · $48 · $79",
    icon: Tag,
  },
] as const;

/** Animated ☰ → ✕ */
function MenuToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className="relative z-[80] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white lg:hidden"
    >
      <span className="relative block h-[14px] w-[18px]" aria-hidden>
        <motion.span
          className="absolute left-0 top-0 block h-[2px] w-full origin-center rounded-full bg-white"
          animate={open ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
        />
        <motion.span
          className="absolute left-0 top-[6px] block h-[2px] w-full rounded-full bg-white"
          animate={open ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.15 }}
        />
        <motion.span
          className="absolute left-0 top-[12px] block h-[2px] w-full origin-center rounded-full bg-white"
          animate={open ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
        />
      </span>
    </button>
  );
}

/**
 * Landing nav.
 * Desktop: Aceternity hover menu.
 * Mobile: shadcn Sheet (Radix portal) — guaranteed visible above page content.
 *          ☰ morphs to ✕ while the sheet is open.
 */
export function LandingNav() {
  const [active, setActive] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[60] border-b border-[var(--line-1)] bg-[color-mix(in_srgb,var(--canvas)_92%,transparent)] backdrop-blur-[14px]">
      <div className="relative mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 md:px-8">
        <a
          href="#top"
          className="inline-flex min-h-11 min-w-0 items-center gap-2.5 sm:gap-3"
          aria-label="Notio home"
          onClick={() => setMobileOpen(false)}
        >
          <img
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-8 w-8 shrink-0 rounded-[10px] object-cover sm:h-9 sm:w-9"
            aria-hidden
          />
          <span className="l-display truncate text-[14px] tracking-[0.1em] sm:text-[15px]">
            NOTIO
          </span>
        </a>

        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
          <Menu setActive={setActive}>
            <MenuItem setActive={setActive} active={active} item="Product">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-2">
                <ProductItem
                  title="Voice → Map"
                  href="#demo"
                  visual="voice"
                  description="Speak freely. Notio structures it into a mind map in seconds."
                />
                <ProductItem
                  title="Mind Report"
                  href="#report"
                  visual="report"
                  description="One calm Sunday reflection — EF score, clarity, focus areas."
                />
                <ProductItem
                  title="Compounding loop"
                  href="#compound"
                  visual="compound"
                  description="Maps get sharper every week as Notio learns your patterns."
                />
                <ProductItem
                  title="Walkthrough"
                  href="#demo-video"
                  visual="video"
                  description="90-sec founder demo — first thought to first map."
                />
              </div>
            </MenuItem>
            <MenuItem setActive={setActive} active={active} item="How it works">
              <div className="flex flex-col space-y-3 text-sm">
                <HoveredLink href="#demo">See the demo</HoveredLink>
                <HoveredLink href="#demo-video">Watch walkthrough</HoveredLink>
                <HoveredLink href="#compound">The compounding loop</HoveredLink>
              </div>
            </MenuItem>
            <MenuItem setActive={setActive} active={active} item="Pricing">
              <div className="flex flex-col space-y-3 text-sm">
                <HoveredLink href="#pricing">Free</HoveredLink>
                <HoveredLink href="#pricing">Pro Monthly · $12</HoveredLink>
                <HoveredLink href="#pricing">Pro Annual · $48</HoveredLink>
                <HoveredLink href="#pricing">Founders Lifetime · $79</HoveredLink>
              </div>
            </MenuItem>
          </Menu>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/auth"
            className="hidden text-[13.5px] font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] md:inline"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="hidden h-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--on-accent)] md:inline-flex md:h-11 md:px-5 md:text-[13.5px]"
          >
            Start free
          </Link>

          <MenuToggle open={mobileOpen} onToggle={() => setMobileOpen((o) => !o)} />
        </div>
      </div>

      {/* Mobile sheet — Radix portals to body; always paints above content */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] rounded-t-[28px] border-[var(--line-2)] bg-[#0b0f12] p-0 text-[var(--ink)] [&>button]:hidden"
        >
          <div className="flex justify-center pt-3" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-white/25" />
          </div>

          <SheetHeader className="px-5 pt-3 pb-2 text-left">
            <SheetTitle className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#4D8DFF]">
              Explore Notio
            </SheetTitle>
            <SheetDescription className="sr-only">
              Jump to a section of the landing page, or sign in.
            </SheetDescription>
          </SheetHeader>

          <nav className="flex flex-col gap-2.5 overflow-y-auto px-4 pb-4">
            {MOBILE_LINKS.map((l) => {
              const Icon = l.icon;
              return (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-[64px] items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-[#0b0f12] text-[#4D8DFF]">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[#F2F8FC]">
                      {l.label}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-white/45">{l.hint}</span>
                  </span>
                  <span className="text-white/40" aria-hidden>
                    →
                  </span>
                </a>
              );
            })}
          </nav>

          <div
            className="flex flex-col gap-2.5 border-t border-white/10 px-4 pt-4"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <Link
              to="/auth"
              onClick={() => setMobileOpen(false)}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#4D8DFF] text-[15px] font-semibold text-[#021016]"
            >
              Start free
            </Link>
            <Link
              to="/auth"
              onClick={() => setMobileOpen(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 text-[14px] font-medium text-white/60"
            >
              Sign in
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
