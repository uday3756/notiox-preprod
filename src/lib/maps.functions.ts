import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userHasProAccess } from "@/lib/billing.functions";

type AnySupabase = {
  from: (table: string) => any;
};

/**
 * Delete (or hide) a map.
 * - Pro / active trial: hard delete (service role; client DELETE was revoked).
 * - Free: soft delete — sets deleted_at so the map leaves the list but still
 *   counts toward the monthly free create limit (stops delete-and-regenerate abuse).
 */
export const deleteMyMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ mapId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as AnySupabase;
    const userId = context.userId;
    const { mapId } = data;

    const { data: map, error: loadErr } = await supabase
      .from("maps")
      .select("id, deleted_at")
      .eq("id", mapId)
      .eq("user_id", userId)
      .maybeSingle();

    if (loadErr) throw new Error(loadErr.message || "Couldn't load map.");
    if (!map) throw new Error("Map not found.");
    if (map.deleted_at) return { mode: "soft" as const, already: true };

    const isPro = await userHasProAccess(supabase, userId);

    if (isPro) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as AnySupabase;
      const { error } = await admin.from("maps").delete().eq("id", mapId).eq("user_id", userId);
      if (error) throw new Error(error.message || "Couldn't delete map.");
      return { mode: "hard" as const };
    }

    const { error } = await supabase
      .from("maps")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", mapId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message || "Couldn't remove map.");
    return { mode: "soft" as const };
  });
