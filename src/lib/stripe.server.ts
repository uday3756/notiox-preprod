import Stripe from "stripe";

/** Server-only Stripe client. Reads STRIPE_SECRET_KEY from the environment. */
export function createStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY. Add it to your .env file.");
  // Publishable keys (pk_…) and other non-secret values will always fail checkout.
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    throw new Error(
      "STRIPE_SECRET_KEY is invalid. Use the Secret key from Stripe Dashboard → Developers → API keys (starts with sk_test_ or sk_live_), not the Publishable key (pk_…).",
    );
  }
  return new Stripe(key);
}

/** Whether the configured secret key is live (real charges) or test. */
export function stripeSecretIsLive(): boolean {
  return process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_live_") ?? false;
}

/**
 * Ensure the Price exists under this secret key and matches live/test mode.
 * Catches the #1 live-switch failure: sk_live_ + test-mode price_… IDs.
 */
export async function assertPriceUsable(
  stripe: Stripe,
  priceId: string,
): Promise<Stripe.Price> {
  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const live = process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_live_");
    throw new Error(
      `Stripe Price "${priceId}" was not found for this API key. ` +
        (live
          ? "You are using a LIVE secret key — create the Products/Prices in Stripe Live mode (toggle top-right) and set STRIPE_PRICE_ID_* to those live price_… IDs in Vercel."
          : "You are using a TEST secret key — use test Price IDs, or switch both the secret key and Price IDs to Live. ") +
        `(${msg})`,
    );
  }

  const keyIsLive = process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_live_") ?? false;
  if (price.livemode !== keyIsLive) {
    throw new Error(
      keyIsLive
        ? "Stripe mode mismatch: LIVE secret key with a TEST Price ID. Real cards will not be charged. In Stripe Dashboard switch to Live, copy the live price_… IDs, and update STRIPE_PRICE_ID / STRIPE_PRICE_ID_MONTHLY / ANNUAL / LIFETIME in Vercel."
        : "Stripe mode mismatch: TEST secret key with a LIVE Price ID. Use sk_test_ + test prices, or sk_live_ + live prices.",
    );
  }

  if (!price.active) {
    throw new Error(`Stripe Price "${priceId}" is archived/inactive. Activate it or pick another Price ID.`);
  }

  return price;
}

/**
 * Drop stale customer IDs from the opposite Stripe mode (test ↔ live).
 * Reusing a test cus_… under sk_live_ makes Checkout fail silently / with opaque errors.
 */
export async function resolveStripeCustomerId(
  stripe: Stripe,
  customerId: string | null | undefined,
): Promise<string | undefined> {
  if (!customerId) return undefined;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return undefined;
    return customer.id;
  } catch {
    // No such customer in this mode (common after switching test → live).
    return undefined;
  }
}

/**
 * Landing + in-app paid plans.
 * - pro-monthly / default → STRIPE_PRICE_ID (or STRIPE_PRICE_ID_MONTHLY)
 * - pro-annual → STRIPE_PRICE_ID_ANNUAL
 * - founders → STRIPE_PRICE_ID_LIFETIME (one-time payment)
 */
export type StripePlan = "pro-monthly" | "pro-annual" | "founders";

export function getStripePriceId(): string {
  return resolvePriceId("pro-monthly");
}

export function resolvePriceId(plan: StripePlan = "pro-monthly"): string {
  if (plan === "pro-annual") {
    const annual = process.env.STRIPE_PRICE_ID_ANNUAL;
    if (!annual) {
      throw new Error(
        "Missing STRIPE_PRICE_ID_ANNUAL. Create a yearly Price in Stripe and add it to .env / Vercel.",
      );
    }
    return annual;
  }
  if (plan === "founders") {
    const life = process.env.STRIPE_PRICE_ID_LIFETIME;
    if (!life) {
      throw new Error(
        "Missing STRIPE_PRICE_ID_LIFETIME. Create a one-time Price ($79) in Stripe and add it to .env / Vercel.",
      );
    }
    return life;
  }
  // Monthly — prefer dedicated monthly id, fall back to legacy STRIPE_PRICE_ID
  const monthly = process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID;
  if (!monthly) {
    throw new Error(
      "Missing STRIPE_PRICE_ID (or STRIPE_PRICE_ID_MONTHLY). Add it to your .env file.",
    );
  }
  return monthly;
}

export function checkoutModeForPlan(plan: StripePlan): "subscription" | "payment" {
  return plan === "founders" ? "payment" : "subscription";
}

/** Free plan: mindmaps allowed per calendar month. */
export const FREE_MAP_LIMIT = 8;
