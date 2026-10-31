import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySupabase = {
  from: (t: string) => {
    delete: () => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Apple App Store requirement: users must be able to delete their account.
 * Wipes user-owned rows (best-effort) then deletes the Auth user.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ confirm: z.literal("DELETE") }).parse(input),
  )
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnySupabase;
    const userId = context.userId;

    const tables = [
      "daily_wins",
      "weekly_reports",
      "node_embeddings",
      "scheduling_nodes",
      "scheduling_logs",
      "task_analytics",
      "reminder_sent",
      "reminder_deliveries",
      "reminder_preferences",
      "canvas_sync_jobs",
      "canvas_sync_stage",
      "canvas_assignments",
      "canvas_credentials",
      "canvas_connections",
      "xp_ledger",
      "dolphin_progress",
      "task_links",
      "schedule_exceptions",
      "user_working_hours",
      "journal_entries",
      "nodes",
      "maps",
      "subscriptions",
      "profiles",
    ];

    for (const table of tables) {
      try {
        await admin.from(table).delete().eq("user_id", userId);
      } catch {
        /* table may not exist or use id instead of user_id */
      }
      try {
        await admin.from(table).delete().eq("id", userId);
      } catch {
        /* ignore */
      }
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message || "Couldn't delete account.");

    return { ok: true as const };
  });
