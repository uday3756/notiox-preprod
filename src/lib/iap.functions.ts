import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySupabase = {
  from: (t: string) => {
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<unknown>;
    delete: () => { eq: (c: string, v: string) => Promise<unknown> };
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

/**
 * After a native IAP purchase/restore, sync Pro into `subscriptions`
 * (same table Stripe writes). Trusts the authenticated user + client-reported
 * entitlement; production should also verify via RevenueCat webhooks.
 */
export const syncStoreEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        active: z.boolean(),
        customerInfoJson: z.string().max(200_000).optional(),
        productId: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnySupabase;

    await admin.from("subscriptions").upsert(
      {
        user_id: context.userId,
        plan: data.active ? "pro" : "free",
        status: data.active ? "active" : "canceled",
        // Keep Stripe columns null for store-only users.
        updated_at: new Date().toISOString(),
        // Store provider hint in status-adjacent fields when present.
        stripe_subscription_id: data.active
          ? `rc:${data.productId ?? "store"}`
          : null,
      },
      { onConflict: "user_id" },
    );

    if (data.active) {
      const pid = (data.productId ?? "").toLowerCase();
      const plan =
        /life|forever|found/i.test(pid)
          ? ("founders" as const)
          : /annual|year/i.test(pid)
            ? ("pro-annual" as const)
            : ("pro-monthly" as const);
      try {
        const { markReferralPremium } = await import("@/lib/referral.functions");
        await markReferralPremium(context.userId, plan);
      } catch {
        /* best-effort */
      }
    }

    return { plan: data.active ? ("pro" as const) : ("free" as const) };
  });

/**
 * RevenueCat webhook — marks users Pro when entitlement activates.
 * Configure in RevenueCat dashboard → set Authorization: Bearer $REVENUECAT_WEBHOOK_SECRET
 * and URL https://notiolive.com/api/webhooks/revenuecat
 */
export async function handleRevenueCatWebhook(request: Request): Promise<Response> {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (token !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let body: {
    event?: {
      type?: string;
      app_user_id?: string;
      entitlement_ids?: string[];
    };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const event = body.event;
  const userId = event?.app_user_id;
  if (!userId || userId.startsWith("$RCAnonymous")) {
    return Response.json({ ok: true, skipped: true });
  }

  const type = (event?.type ?? "").toUpperCase();
  const entitlements = event?.entitlement_ids ?? [];
  const hasPro = entitlements.includes("pro");

  const activateTypes = new Set([
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "PRODUCT_CHANGE",
    "NON_RENEWING_PURCHASE",
  ]);
  const deactivateTypes = new Set(["EXPIRATION", "CANCELLATION"]);

  let active: boolean | null = null;
  if (activateTypes.has(type) && hasPro) active = true;
  if (deactivateTypes.has(type)) active = false;
  if (active === null) return Response.json({ ok: true, ignored: type });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnySupabase;

  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: active ? "pro" : "free",
      status: active ? "active" : "canceled",
      stripe_subscription_id: active ? `rc:webhook:${type}` : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return Response.json({ ok: true, plan: active ? "pro" : "free" });
}
