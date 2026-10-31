import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { FEATURE_FLAGS } from "./feature-flags";
import { mapDraftSchema, type MapDraft } from "./capture-draft.types";
import { assertCanCreateMap } from "./billing.functions";
import { radialLayout } from "./layout";
import { logicalDate, normalizeRingSettings } from "./rings/day";

export const generateThoughtDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        transcript: z.string().trim().min(4).max(30000),
        style: z.string().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Reviewed capture is not enabled.");
    const client = context.supabase as unknown as SupabaseClient;
    const { data: claim, error } = await client.rpc("notio_claim_draft", {
      p_id: data.requestId,
      p_transcript: data.transcript,
    });
    if (error) throw new Error(error.message);
    if (!claim.claimed) return { draft: mapDraftSchema.parse(claim.content) };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    try {
      await assertCanCreateMap(client, context.userId);
      const { generateStructuredThought } = await import("./notio.functions");
      const draft: MapDraft = mapDraftSchema.parse(await generateStructuredThought(data));
      const { error: saveError } = await admin
        .from("capture_drafts")
        .update({ content: draft, status: "ready", updated_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .eq("request_id", data.requestId);
      if (saveError) throw new Error("Couldn't keep your draft. Try again.");
      return { draft };
    } catch (error) {
      await admin
        .from("capture_drafts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .eq("request_id", data.requestId);
      throw error;
    }
  });

export const saveThoughtDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        draft: mapDraftSchema,
        nextNodeId: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Reviewed capture is not enabled.");
    const client = context.supabase as unknown as SupabaseClient;
    const { data: existing, error: readError } = await client
      .from("capture_drafts")
      .select("status,saved_map_id,content")
      .eq("user_id", context.userId)
      .eq("request_id", data.requestId)
      .single();
    if (readError) throw new Error("Draft not found.");
    if (existing.status === "saved" && existing.saved_map_id)
      return { mapId: existing.saved_map_id as string, title: existing.content.title as string };
    await assertCanCreateMap(client, context.userId);
    if (data.nextNodeId && !data.draft.nodes.some((n) => n.id === data.nextNodeId && n.parentId))
      throw new Error("Choose an action from this draft.");
    const { userHasProAccess } = await import("./billing.functions");
    const { FREE_MAP_LIMIT } = await import("./stripe.server");
    const { data: profile } = await client
      .from("profiles")
      .select("bonus_map_credits")
      .eq("id", context.userId)
      .maybeSingle();
    const limit = (await userHasProAccess(client, context.userId))
      ? null
      : FREE_MAP_LIMIT + Math.max(0, profile?.bonus_map_credits ?? 0);
    const { data: hours } = await client
      .from("user_working_hours")
      .select("timezone,day_start_hour")
      .eq("user_id", context.userId)
      .maybeSingle();
    const settings = normalizeRingSettings(hours);
    const positions = radialLayout(
      data.draft.nodes.map((n) => ({ id: n.id, parent: n.parentId ?? null })),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as unknown as SupabaseClient).rpc(
      "notio_save_draft",
      {
        p_actor: context.userId,
        p_id: data.requestId,
        p_content: data.draft,
        p_positions: positions,
        p_logical_date: logicalDate(new Date(), settings.timezone, settings.day_start_hour),
        p_selected: data.nextNodeId,
        p_limit: limit,
      },
    );
    if (error) throw new Error("Couldn't save your map. Your draft is still here; try again.");
    return result as { mapId: string; title: string };
  });
