import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { FEATURE_FLAGS } from "./feature-flags";
export const getTaskTimezone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as unknown as SupabaseClient)
      .from("user_working_hours")
      .select("timezone")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load your timezone.");
    return data?.timezone as string | null;
  });
export const saveTaskSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        start: z.string().datetime(),
        end: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Workflow is not enabled.");
    const { data: result, error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_schedule_task",
      { p_id: data.id, p_revision: data.revision, p_start: data.start, p_end: data.end },
    );
    if (error)
      throw new Error(
        error.message.includes("STALE_REVISION")
          ? "This task changed. Refresh and try again."
          : "Couldn't save the schedule.",
      );
    if (!result.conflict) {
      const { flushCompletionExports } = await import("./task-completion.server");
      void flushCompletionExports(context.userId).catch(() => undefined);
    }
    return result as { conflict: boolean; suggestedStart?: string; revision?: number };
  });
