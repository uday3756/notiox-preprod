import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completionCommand } from "./task-completion.types";

const taskPatch = z.object({
  taskId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  title: z.string().trim().min(1).max(200).optional(),
  start_time: z.string().datetime({ offset: true }).nullable().optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(["pending", "in_progress", "completed", "deferred"]).optional(),
});

/** Canonical complete — delegates to existing completion RPC (no client XP). */
export const completeCanonicalTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => completionCommand.parse(input))
  .handler(async ({ data, context }) => {
    const { commitTaskCompletion } = await import("./task-completion.server");
    return commitTaskCompletion(
      context.userId,
      data,
      context.supabase as unknown as SupabaseClient,
    );
  });

export const updateCanonicalTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => taskPatch.parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const { data: row, error: readErr } = await client
      .from("scheduling_nodes")
      .select("id, revision, source, tombstone")
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr || !row) throw new Error("Task not found.");
    if (row.tombstone) throw new Error("This task was removed.");
    if (row.revision !== data.expectedRevision) throw new Error("Task changed. Refresh and retry.");
    const patch: Record<string, unknown> = { revision: row.revision + 1 };
    if (data.title !== undefined) patch.title = data.title;
    if (data.start_time !== undefined) patch.start_time = data.start_time;
    if (data.due_at !== undefined) patch.due_at = data.due_at;
    if (data.status !== undefined) patch.status = data.status;
    const { error } = await client
      .from("scheduling_nodes")
      .update(patch)
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .eq("revision", data.expectedRevision);
    if (error) throw new Error("Couldn't update task.");
    return { ok: true, revision: row.revision + 1 };
  });

export const tombstoneCanonicalTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ taskId: z.string().uuid(), expectedRevision: z.number().int().min(0) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const { error } = await client
      .from("scheduling_nodes")
      .update({ tombstone: true, status: "deferred", revision: data.expectedRevision + 1 })
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .eq("revision", data.expectedRevision);
    if (error) throw new Error("Couldn't remove task.");
    return { ok: true };
  });

const voiceUpsert = z.object({
  title: z.string().trim().min(1).max(200),
  start_time: z.string().datetime({ offset: true }).nullable().optional(),
  end_time: z.string().datetime({ offset: true }).nullable().optional(),
  is_timebound: z.boolean().optional(),
  category: z.string().max(40).optional(),
  source: z.enum(["voice", "capture", "journal", "manual"]).default("voice"),
  map_id: z.string().uuid().nullable().optional(),
  original_transcript: z.string().max(20000).optional(),
  extracted_intent: z.unknown().optional(),
  estimated_duration_minutes: z.number().int().min(0).max(480).optional(),
  priority: z.number().int().min(1).max(5).optional(),
});

/**
 * Source-aware voice/chrono upsert. Never merges onto Canvas rows.
 * Uses title+start only among non-Canvas pending rows.
 */
export const upsertVoiceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => voiceUpsert.parse(input))
  .handler(async ({ data, context }) => {
    const { voiceUpsertShouldSkip } = await import("./task-identity");
    const client = context.supabase as unknown as SupabaseClient;
    if (data.start_time) {
      const { data: existing } = await client
        .from("scheduling_nodes")
        .select("id, source, tombstone")
        .eq("user_id", context.userId)
        .eq("title", data.title)
        .eq("start_time", data.start_time)
        .maybeSingle();
      if (existing) {
        if (voiceUpsertShouldSkip(existing.source) || existing.tombstone) {
          return { ok: true as const, id: existing.id, skipped: true as const };
        }
        const { error } = await client
          .from("scheduling_nodes")
          .update({
            map_id: data.map_id ?? undefined,
            extracted_intent: data.extracted_intent ?? undefined,
            original_transcript: data.original_transcript ?? undefined,
          })
          .eq("id", existing.id)
          .eq("user_id", context.userId);
        if (error) throw new Error("Couldn't update task.");
        return { ok: true as const, id: existing.id, skipped: false as const };
      }
    }

    const insert: Record<string, unknown> = {
      user_id: context.userId,
      title: data.title,
      start_time: data.start_time ?? null,
      end_time: data.end_time ?? null,
      is_timebound: data.is_timebound ?? Boolean(data.start_time),
      status: "pending",
      category: data.category ?? "task",
      source: data.source,
      map_id: data.map_id ?? null,
      original_transcript: data.original_transcript ?? null,
      extracted_intent: data.extracted_intent ?? null,
      estimated_duration_minutes: data.estimated_duration_minutes ?? null,
      priority: data.priority ?? 3,
    };
    const { data: row, error } = await client
      .from("scheduling_nodes")
      .insert(insert)
      .select("id")
      .maybeSingle();
    if (error || !row) {
      const fallback = { ...insert };
      delete fallback.source;
      const retry = await client.from("scheduling_nodes").insert(fallback).select("id").maybeSingle();
      if (retry.error || !retry.data) throw new Error(error?.message ?? "Couldn't save task.");
      return { ok: true as const, id: retry.data.id as string, skipped: false as const };
    }
    return { ok: true as const, id: row.id as string, skipped: false as const };
  });

export const updateReminderOffset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        remind_offset_minutes: z.number().int().min(0).max(1440).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const { data: row, error: readErr } = await client
      .from("scheduling_nodes")
      .select("id, extracted_intent, source")
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr || !row) throw new Error("Task not found.");
    const base =
      row.extracted_intent && typeof row.extracted_intent === "object"
        ? { ...(row.extracted_intent as Record<string, unknown>) }
        : {};
    if (data.remind_offset_minutes === null) delete base.remind_offset_minutes;
    else base.remind_offset_minutes = data.remind_offset_minutes;
    const { error } = await client
      .from("scheduling_nodes")
      .update({ extracted_intent: base })
      .eq("id", data.taskId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't update reminder time.");
    return { ok: true as const };
  });
