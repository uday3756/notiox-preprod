import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createCheckoutSession } from "@/lib/billing.functions";

/**
 * Landing pricing — Free / Pro Monthly / Pro Annual / Founders slot request.
 * Marketing page: Free → /auth; paid Stripe → Checkout (sign-in first);
 * Founders → /claim-slot form (no online payment).
 */

type PlanId = "free" | "pro-monthly" | "pro-annual" | "founders";

type Tier = {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  blurb: string;
  features: string[];
  cta: string;
  tag?: string;
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "",
    blurb: "8 mind maps per reset cycle. Soft-cap resets every few days to build the habit.",
    features: [
      "Voice + keyboard capture",
      "Standard organization",
      "Recordings up to 3 minutes",
      "Baseline Executive Function tracking",
    ],
    cta: "Start free",
  },
  {
    id: "pro-monthly",
    name: "Pro Monthly",
    price: "$12",
    period: "/month",
    blurb: "True cognitive freedom. No caps, no queues, no friction.",
    features: [
      "Unlimited mind maps",
      "Priority processing",
      "10-minute voice sessions",
      "Advanced EF Score dashboard",
      "Full Weekly Mind Report",
      "Cross-device cloud sync",
    ],
    cta: "Go Pro",
  },
  {
    id: "pro-annual",
    name: "Pro Annual",
    price: "$48",
    period: "/yr",
    blurb: "Same Pro power — pay once a year and forget about it.",
    features: [
      "Everything in Pro Monthly",
      "Two months free vs monthly",
      "Priority support",
      "Founder's pricing locked in",
    ],
    cta: "Go Pro Annual",
    tag: "Best value · Founder's choice",
    featured: true,
  },
  {
    id: "founders",
    name: "Founders Lifetime",
    price: "Invite",
    period: "",
    blurb: "Limited Lifetime slots — leave your details and we’ll reserve one under your name.",
    features: [
      "All future premium tiers, forever",
      "Direct line to the dev team",
      "Founding Member badge",
    ],
    cta: "Claim a slot",
    tag: "Limited slots",
  },
];

export function LandingPricing() {
  const navigate = useNavigate();
  const checkoutFn = useServerFn(createCheckoutSession);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);

  async function startCheckout(plan: Exclude<PlanId, "free" | "founders">) {
    setBusyPlan(plan);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        try {
          sessionStorage.setItem("notio_checkout_plan", plan);
        } catch {
          /* ignore */
        }
        navigate({ to: "/auth" });
        toast.message("Sign in to continue to checkout.");
        return;
      }

      const { url } = await checkoutFn({
        data: { origin: window.location.origin, plan },
      });
      if (!url) throw new Error("No checkout URL returned.");
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't start checkout.";
      if (!/cancel|cancelled/i.test(msg)) toast.error(msg);
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <section
      id="pricing"
      aria-label="Pricing"
      className="mx-auto max-w-[1220px] px-4 pb-16 sm:px-6 sm:pb-20 md:px-8 md:pb-[130px]"
    >
      <p className="l-eyebrow text-center">Pricing</p>
      <h2 className="l-display mx-auto mt-3 max-w-[640px] text-center text-[clamp(26px,7vw,42px)] leading-[1.15] sm:mt-4 sm:leading-[1.12]">
        Clarity without subscription dread.
      </h2>
      <p className="mx-auto mt-3 max-w-[560px] text-center text-[14.5px] leading-relaxed text-[var(--ink-muted)] sm:mt-4 sm:text-[15.5px]">
        Start free — upgrade monthly or yearly when Notio earns a place in your head.
        Lifetime slots are invite-only via a short request form.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4 lg:gap-4 lg:gap-y-5">
        {TIERS.map((t) => (
          <article
            key={t.id}
            className={`l-hover-lift relative flex flex-col rounded-[16px] border p-5 pt-7 sm:rounded-[22px] sm:p-6 sm:pt-8 md:rounded-[26px] ${
              t.featured
                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-1))]"
                : "l-card border-[var(--line-1)]"
            }`}
          >
            {t.tag && (
              <span
                className={`absolute -top-3 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 truncate rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] sm:px-3 sm:text-[10.5px] sm:tracking-[0.14em] ${
                  t.featured
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "border border-[var(--line-2)] bg-[var(--canvas)] text-[var(--accent)]"
                }`}
              >
                {t.tag}
              </span>
            )}
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] sm:text-[13px]">
              {t.name}
            </p>
            <p className="mt-3 flex items-baseline gap-1">
              <span className="l-display text-[36px] leading-none text-[var(--ink-strong)] sm:text-[42px]">
                {t.price}
              </span>
              {t.period && (
                <span className="text-[14px] text-[var(--ink-faint)]">{t.period}</span>
              )}
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--ink-muted)]">
              {t.blurb}
            </p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2 text-[13.5px] text-[var(--ink)]">
                  <span className="mt-0.5 text-[var(--accent)]" aria-hidden>
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            {t.id === "free" ? (
              <Link
                to="/auth"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--surface-2)] px-5 py-2.5 text-[13.5px] font-semibold text-[var(--ink)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
              >
                {t.cta}
              </Link>
            ) : t.id === "founders" ? (
              <Link
                to="/claim-slot"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--surface-2)] px-5 py-2.5 text-[13.5px] font-semibold text-[var(--ink)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
              >
                {t.cta}
              </Link>
            ) : (
              <button
                type="button"
                disabled={busyPlan !== null}
                onClick={() => startCheckout(t.id as Exclude<PlanId, "free" | "founders">)}
                className={`mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 disabled:opacity-60 ${
                  t.featured
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "border border-[var(--line-2)] bg-[var(--surface-2)] text-[var(--ink)]"
                }`}
              >
                {busyPlan === t.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {busyPlan === t.id ? "Redirecting…" : t.cta}
              </button>
            )}
          </article>
        ))}
      </div>

      <p className="mt-8 text-center text-[12.5px] text-[var(--ink-faint)]">
        Prices in USD. Cancel anytime. Your maps are always yours to export.
      </p>
    </section>
  );
}
