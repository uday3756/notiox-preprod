import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const codeInput = z
  .object({
    code: z.string().trim().min(1).max(64),
  })
  .transform((v) => ({ code: v.code.toUpperCase() }));

export type AuthCodeLookup = {
  ok: boolean;
  kind?: "referral" | "promo";
  code?: string;
  referrer_name?: string;
  trial_days?: number;
  error?: string;
  already?: boolean;
};

function mapLookupError(code?: string): string {
  switch (code) {
    case "EMPTY":
      return "Enter a code.";
    case "NOT_FOUND":
      return "Code not found.";
    case "COUPON_INACTIVE":
      return "This promo code is no longer active.";
    case "COUPON_EXPIRED":
      return "This promo code has expired.";
    case "LIMIT_REACHED":
      return "This promo code has reached its limit.";
    default:
      return "Couldn't verify that code.";
  }
}

/** Live-validate an optional promo / referral code on the auth form (no login required). */
export const lookupAuthCode = createServerFn({ method: "POST" })
  .validator((input: unknown) => codeInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("lookup_auth_code", {
      p_code: data.code,
    });
    if (error) throw new Error(error.message);
    const row = (res ?? {}) as AuthCodeLookup;
    if (!row.ok) {
      return { ok: false as const, error: mapLookupError(row.error) };
    }
    return {
      ok: true as const,
      kind: row.kind as "referral" | "promo",
      code: row.code as string,
      referrerName: row.referrer_name as string,
      trialDays: row.trial_days as number | undefined,
    };
  });

/** Attach a verified promo/referral code to the signed-in user (once). */
export const applyAuthCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => codeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("apply_auth_code", {
      p_user_id: context.userId,
      p_code: data.code,
    });
    if (error) throw new Error(error.message);
    const row = (res ?? {}) as AuthCodeLookup;
    if (!row.ok) {
      throw new Error(mapLookupError(row.error));
    }
    return {
      ok: true as const,
      already: Boolean(row.already),
      kind: row.kind as "referral" | "promo" | undefined,
      code: row.code as string | undefined,
      referrerName: row.referrer_name as string,
    };
  });

export async function markReferralPremium(
  userId: string,
  plan: "pro-monthly" | "pro-annual" | "founders",
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("mark_referral_premium", {
    p_user_id: userId,
    p_plan: plan,
  });
}
