import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const getReminderPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const { data } = await client
      .from("reminder_preferences")
      .select("email_opt_in, canvas_email_opt_in, timezone")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      email_opt_in: data?.email_opt_in ?? false,
      canvas_email_opt_in: data?.canvas_email_opt_in ?? false,
      timezone: data?.timezone ?? null,
    };
  });

export const setReminderPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        email_opt_in: z.boolean().optional(),
        canvas_email_opt_in: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await import("@/integrations/supabase/client.server").then(
      (m) => m.supabaseAdmin as unknown as SupabaseClient,
    );
    const { error } = await admin.from("reminder_preferences").upsert({
      user_id: context.userId,
      ...data,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Couldn't save reminder preferences.");
    return { ok: true };
  });
