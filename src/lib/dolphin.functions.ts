import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURE_FLAGS } from "./feature-flags";
import { levelForXp, progressForXp } from "./dolphin-progression";

export const getDolphinPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.dolphinXp) {
      return { enabled: false as const };
    }
    const client = context.supabase as unknown as SupabaseClient;
    const { data } = await client
      .from("dolphin_profiles")
      .select("confirmed_xp, companion_enabled, lifetime_xp, stage")
      .eq("user_id", context.userId)
      .maybeSingle();
    const xp = data?.confirmed_xp ?? 0;
    const { data: ledger } = await client
      .from("xp_ledger")
      .select("id, delta, created_at, task_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(12);
    return {
      enabled: true as const,
      confirmedXp: xp,
      lifetimeXp: data?.lifetime_xp ?? xp,
      companionEnabled: data?.companion_enabled ?? true,
      stage: data?.stage ?? "leaf",
      progress: progressForXp(xp),
      level: levelForXp(xp),
      ledger: ledger ?? [],
    };
  });
