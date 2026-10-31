/**
 * Aceternity-style floating navbar menu (adapted for Notio).
 * ProductItem supports a unique visualVariant so cards don't all look identical.
 */
import React from "react";
import { motion } from "framer-motion";
import { Mic, Sparkles, Network, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const transition = {
  type: "spring" as const,
  mass: 0.5,
  damping: 11.5,
  stiffness: 100,
  restDelta: 0.001,
  restSpeed: 0.001,
};

export type ProductVisual = "voice" | "report" | "compound" | "video";

export const MenuItem = ({
  setActive,
  active,
  item,
  children,
}: {
  setActive: (item: string) => void;
  active: string | null;
  item: string;
  children?: React.ReactNode;
}) => {
  return (
    <div onMouseEnter={() => setActive(item)} className="relative">
      <motion.p
        transition={{ duration: 0.3 }}
        className="cursor-pointer text-[13.5px] font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
      >
        {item}
      </motion.p>
      {active !== null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={transition}
        >
          {active === item && (
            // Wrapper starts at the trigger and pads down to the panel, so the
            // pointer never crosses unhoverable space and closes the menu.
            <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-[1.85rem]">
              <motion.div
                transition={transition}
                layoutId="active"
                className="overflow-hidden rounded-2xl border border-[var(--line-2)] bg-[color-mix(in_srgb,var(--canvas)_94%,#000)] shadow-xl backdrop-blur-md"
              >
                <motion.div layout className="h-full w-max max-w-[min(92vw,34rem)] p-3 sm:p-4">
                  {children}
                </motion.div>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export const Menu = ({
  setActive,
  children,
  className,
}: {
  setActive: (item: string | null) => void;
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <nav
      onMouseLeave={() => setActive(null)}
      className={cn(
        "relative flex items-center justify-center space-x-5 rounded-full border border-[var(--line-2)] bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)] px-6 py-2.5 shadow-[0_0_40px_-12px_var(--glow-c)] backdrop-blur-md",
        className,
      )}
    >
      {children}
    </nav>
  );
};

function VisualThumb({ variant }: { variant: ProductVisual }) {
  const base =
    "relative flex h-[56px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--line-1)] sm:h-[60px] sm:w-[110px]";

  if (variant === "voice") {
    return (
      <div
        className={cn(base)}
        style={{
          background:
            "radial-gradient(circle at 30% 40%, rgba(77,141,255,0.45), transparent 55%), #0b0f12",
        }}
      >
        <Mic className="relative z-[1] h-5 w-5 text-[var(--accent)]" strokeWidth={2.2} />
        <div className="absolute bottom-2 flex items-end gap-[2px]" aria-hidden>
          {[8, 14, 10, 16, 9].map((h, i) => (
            <span
              key={i}
              className="w-[2.5px] rounded-full bg-[var(--accent)]/70"
              style={{ height: h }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "report") {
    return (
      <div
        className={cn(base)}
        style={{
          background:
            "radial-gradient(circle at 70% 30%, rgba(77,141,255,0.35), transparent 50%), #0b0f12",
        }}
      >
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
          <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="20"
            cy="20"
            r="14"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 14 * 0.82} ${2 * Math.PI * 14}`}
            transform="rotate(-90 20 20)"
          />
          <text
            x="20"
            y="22"
            textAnchor="middle"
            fill="var(--ink-strong)"
            fontSize="9"
            fontWeight="700"
            fontFamily="Space Grotesk, sans-serif"
          >
            82
          </text>
        </svg>
      </div>
    );
  }

  if (variant === "compound") {
    return (
      <div
        className={cn(base)}
        style={{
          background:
            "radial-gradient(circle at 50% 60%, rgba(77,141,255,0.3), transparent 55%), #0b0f12",
        }}
      >
        <Network className="absolute h-4 w-4 text-[var(--ink-faint)]" style={{ left: 14, top: 12 }} />
        <Network className="h-5 w-5 text-[var(--accent)]" />
        <Sparkles className="absolute h-3.5 w-3.5 text-[var(--accent)]" style={{ right: 12, bottom: 10 }} />
      </div>
    );
  }

  // video
  return (
    <div
      className={cn(base)}
      style={{
        background:
          "linear-gradient(135deg, rgba(77,141,255,0.25), transparent 60%), #0b0f12",
      }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_0_20px_var(--glow-c)]">
        <Play className="h-3.5 w-3.5 fill-current" />
      </span>
    </div>
  );
}

export const ProductItem = ({
  title,
  description,
  href,
  visual,
}: {
  title: string;
  description: string;
  href: string;
  visual: ProductVisual;
}) => {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--surface-2)]"
    >
      <VisualThumb variant={visual} />
      <div className="min-w-0 pt-0.5">
        <h4 className="mb-0.5 text-[13px] font-bold text-[var(--ink-strong)] sm:text-sm">
          {title}
        </h4>
        <p className="max-w-[12rem] text-[11.5px] leading-snug text-[var(--ink-muted)] sm:text-[12.5px]">
          {description}
        </p>
      </div>
    </a>
  );
};

export const HoveredLink = ({
  children,
  className,
  href,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => {
  return (
    <a
      href={href}
      {...rest}
      className={cn(
        "text-[13.5px] text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]",
        className,
      )}
    >
      {children}
    </a>
  );
};
