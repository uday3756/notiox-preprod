import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { FEATURE_FLAGS } from "./feature-flags";
export type TaskNudge = { id: string; taskId: string; title: string; estimate: number | null };
export const getNudgePreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.workflow) return { enabled: false, ignored_count: 0 };
    const { data, error } = await (context.supabase as unknown as SupabaseClient)
      .from("task_nudge_settings")
      .select("enabled,ignored_count")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load reminder preferences.");
    return (data ?? { enabled: false, ignored_count: 0 }) as {
      enabled: boolean;
      ignored_count: number;
    };
  });
export const saveNudgePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ enabled: z.boolean(), timezone: z.string().max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Workflow is not enabled.");
    new Intl.DateTimeFormat("en-US", { timeZone: data.timezone }).format();
    const { error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_nudge_preferences",
      { p_enabled: data.enabled, p_timezone: data.timezone },
    );
    if (error) throw new Error("Couldn't save reminders.");
    return { ok: true };
  });
export const claimTaskNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.workflow) return null;
    const { data, error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_claim_nudge",
    );
    if (error) throw new Error("Couldn't check reminders.");
    return data as TaskNudge | null;
  });
export const respondTaskNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["started", "snoozed", "not_today", "dismissed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Workflow is not enabled.");
    const { error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_respond_nudge",
      { p_id: data.id, p_action: data.action },
    );
    if (error) throw new Error("Couldn't update reminder.");
    return { ok: true };
  });
