import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createStripe,
  resolvePriceId,
  checkoutModeForPlan,
  assertPriceUsable,
  resolveStripeCustomerId,
  FREE_MAP_LIMIT,
  type StripePlan,
} from "@/lib/stripe.server";

// The generated Database type doesn't include the `subscriptions` table, so we
// access it through a loosely-typed handle. Runtime behaviour is unaffected.
type AnySupabase = {
  from: (table: string) => any;
};

function firstOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** True when a trialing subscription has passed its end date. */
function trialExpired(row: { status?: string | null; current_period_end?: string | null }): boolean {
  return (
    row.status === "trialing" &&
    !!row.current_period_end &&
    new Date(row.current_period_end).getTime() < Date.now()
  );
}

async function readPlan(supabase: AnySupabase, userId: string): Promise<"free" | "pro"> {
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data || data.plan !== "pro") return "free";
    // An expired free trial no longer grants premium.
    if (trialExpired(data)) return "free";
    return "pro";
  } catch {
    return "free";
  }
}

/** True for paid Pro and active free-trial / coupon users. */
export async function userHasProAccess(
  supabase: AnySupabase,
  userId: string,
): Promise<boolean> {
  return (await readPlan(supabase, userId)) === "pro";
}

async function countMapsThisMonth(supabase: AnySupabase): Promise<number> {
  const { count } = await supabase
    .from("maps")
    .select("id", { count: "exact", head: true })
    .gte("created_at", firstOfMonthISO());
  return count ?? 0;
}

/** Persistent bonus map credits (e.g. earned by submitting a support ticket).
 *  These extend the monthly free allowance. */
async function readBonusCredits(supabase: AnySupabase, userId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("bonus_map_credits")
      .eq("id", userId)
      .maybeSingle();
    return Math.max(0, data?.bonus_map_credits ?? 0);
  } catch {
    return 0;
  }
}

/** Throws if a free user is over the monthly map limit (+ bonus credits). Pro bypasses. */
export async function assertCanCreateMap(supabase: AnySupabase, userId: string) {
  const plan = await readPlan(supabase, userId);
  if (plan === "pro") return;
  const [used, bonus] = await Promise.all([
    countMapsThisMonth(supabase),
    readBonusCredits(supabase, userId),
  ]);
  const limit = FREE_MAP_LIMIT + bonus;
  if (used >= limit) {
    throw new Error(
      `You've reached your limit of ${limit} mindmaps this month. Upgrade to Pro for unlimited.`,
    );
  }
}

/** Whole-day countdown from now to `end` (0 once past). */
function daysRemaining(end: string): number {
  const ms = new Date(end).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

type TrialInfo = {
  startDate: string;
  endDate: string;
  daysRemaining: number;
} | null;

/** Current plan + usage + trial state, for the pricing/profile UI. */
export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const mapsThisMonth = await countMapsThisMonth(supabase);
    const bonusCredits = await readBonusCredits(supabase, context.userId);

    let sub: {
      plan?: string | null;
      status?: string | null;
      current_period_end?: string | null;
    } | null = null;
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan, status, current_period_end")
        .eq("user_id", context.userId)
        .maybeSingle();
      sub = data ?? null;
    } catch {
      sub = null;
    }

    // Lazily expire a finished trial so premium locks without a cron job.
    if (sub && trialExpired(sub)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as AnySupabase;
      await admin
        .from("subscriptions")
        .update({ plan: "free", status: "trial_expired", updated_at: new Date().toISOString() })
        .eq("user_id", context.userId);
      return {
        plan: "free" as const,
        status: "trial_expired" as const,
        trial: null as TrialInfo,
        trialExpired: true,
        mapsThisMonth,
        limit: FREE_MAP_LIMIT + bonusCredits,
        bonusCredits,
      };
    }

    const isTrialing = sub?.status === "trialing" && !!sub?.current_period_end;
    const plan: "free" | "pro" = sub?.plan === "pro" ? "pro" : "free";
    const trial: TrialInfo =
      isTrialing && sub?.current_period_end
        ? {
            // trial_start isn't on subscriptions; the redemption row holds it.
            // For the countdown the end date + remaining days are what matter.
            startDate: sub.current_period_end, // overwritten below from redemption
            endDate: sub.current_period_end,
            daysRemaining: daysRemaining(sub.current_period_end),
          }
        : null;

    // Pull the accurate trial_start/end from the redemption record when trialing.
    if (trial) {
      try {
        const { data: r } = await supabase
          .from("coupon_redemptions")
          .select("trial_start_date, trial_end_date")
          .eq("user_id", context.userId)
          .order("redeemed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (r) {
          trial.startDate = r.trial_start_date;
          trial.endDate = r.trial_end_date;
          trial.daysRemaining = daysRemaining(r.trial_end_date);
        }
      } catch {
        /* fall back to subscription end date */
      }
    }

    return {
      plan,
      status: (sub?.status ?? null) as string | null,
      trial,
      trialExpired: false,
      mapsThisMonth,
      limit: FREE_MAP_LIMIT + bonusCredits,
      bonusCredits,
    };
  });

// Map Postgres exceptions raised by redeem_coupon() to friendly messages.
const COUPON_ERRORS: Record<string, string> = {
  COUPON_NOT_FOUND: "Invalid coupon code.",
  COUPON_INACTIVE: "This coupon is no longer active.",
  COUPON_EXPIRED: "This coupon has expired.",
  LIMIT_REACHED: "This coupon has reached its usage limit.",
  ALREADY_REDEEMED: "You've already redeemed a free-trial coupon.",
};

/**
 * Redeem a coupon for the authenticated user. All validation and the trial
 * grant happen atomically inside the SECURITY DEFINER redeem_coupon() function,
 * called with the service-role client and the JWT-verified user id — the client
 * can neither call it directly nor tamper with trial dates.
 */
export const redeemCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ code: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };

    const { data: res, error } = await admin.rpc("redeem_coupon", {
      p_user_id: context.userId,
      p_code: data.code,
    });

    if (error) {
      const raw = String(error.message ?? "");
      const code = Object.keys(COUPON_ERRORS).find((k) => raw.includes(k));
      throw new Error(code ? COUPON_ERRORS[code] : "Network error. Please try again.");
    }

    return {
      couponCode: res.coupon_code as string,
      trialDays: res.trial_days as number,
      startDate: res.trial_start_date as string,
      endDate: res.trial_end_date as string,
      daysRemaining: daysRemaining(res.trial_end_date as string),
    };
  });

/** Create a Stripe Checkout session and return its URL.
 *  Optional `plan` selects monthly / annual / founders lifetime price IDs. */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        origin: z.string().url(),
        plan: z.enum(["pro-monthly", "pro-annual", "founders"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const stripe = createStripe();
    const supabase = context.supabase as unknown as AnySupabase;
    const plan: StripePlan = data.plan ?? "pro-monthly";
    const priceId = resolvePriceId(plan);
    const mode = checkoutModeForPlan(plan);

    // Fail fast with a clear message if Price IDs are still from Test mode
    // while STRIPE_SECRET_KEY is Live (or the reverse).
    await assertPriceUsable(stripe, priceId);

    // Reuse an existing Stripe customer if we have one — but only if it exists
    // in THIS mode. A test-mode cus_… left in Supabase breaks live Checkout.
    let customerId: string | undefined;
    try {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", context.userId)
        .maybeSingle();
      customerId = await resolveStripeCustomerId(stripe, sub?.stripe_customer_id);
    } catch {
      customerId = undefined;
    }

    const email = (context.claims as { email?: string }).email;

    try {
      const session = await stripe.checkout.sessions.create({
        mode,
        line_items: [{ price: priceId, quantity: 1 }],
        customer: customerId,
        customer_email: customerId ? undefined : email,
        client_reference_id: context.userId,
        metadata: { notio_plan: plan, user_id: context.userId },
        allow_promotion_codes: true,
        success_url: `${data.origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${data.origin}/pricing?checkout=cancelled`,
      });
      return { url: session.url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surface Stripe's message — usually "No such price" / customer mode issues.
      throw new Error(
        msg.includes("No such price") || msg.includes("No such customer")
          ? `${msg} — almost always a live/test mode mismatch. Use sk_live_ with LIVE price IDs (and clear any old test customer), or sk_test_ with TEST prices.`
          : msg,
      );
    }
  });

/**
 * Verify a returned Checkout session with Stripe and, if paid, mark the user
 * Pro. Writes go through the service-role client so users can't self-upgrade.
 */
export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ sessionId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const stripe = createStripe();
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["subscription"],
    });

    if (session.client_reference_id !== context.userId) {
      throw new Error("This checkout session belongs to a different account.");
    }

    const isPaid =
      session.payment_status === "paid" ||
      session.status === "complete" ||
      session.payment_status === "no_payment_required";
    const isActive = isPaid;
    const sub = session.subscription as Stripe.Subscription | string | null;
    const subObj = typeof sub === "object" && sub ? sub : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnySupabase;

    await admin.from("subscriptions").upsert(
      {
        user_id: context.userId,
        plan: isActive ? "pro" : "free",
        status: subObj?.status ?? (isActive ? "active" : null),
        stripe_customer_id:
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        stripe_subscription_id: typeof sub === "string" ? sub : subObj?.id ?? null,
        current_period_end: subObj?.current_period_end
          ? new Date(subObj.current_period_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (isActive) {
      const planMeta = session.metadata?.notio_plan;
      const plan =
        planMeta === "pro-annual" || planMeta === "founders" || planMeta === "pro-monthly"
          ? planMeta
          : "pro-monthly";
      try {
        const { markReferralPremium } = await import("@/lib/referral.functions");
        await markReferralPremium(context.userId, plan);
      } catch {
        /* attribution update is best-effort */
      }
    }

    return { plan: isActive ? ("pro" as const) : ("free" as const) };
  });
