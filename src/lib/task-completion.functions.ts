import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completionCommand, type ActionableTask } from "./task-completion.types";
import { FEATURE_FLAGS } from "./feature-flags";

export const setTaskCompletion = createServerFn({ method: "POST" })
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

export const getTaskForNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ nodeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Task workflow is not enabled.");
    const { data: task, error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_task_for_node",
      { p_node_id: data.nodeId },
    );
    if (error) throw new Error("Couldn't link this task. Its existing links may need review.");
    return task as ActionableTask;
  });

export const getActionableTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.workflow) return [] as ActionableTask[];
    const { data, error } = await (context.supabase as unknown as SupabaseClient)
      .from("scheduling_nodes")
      .select(
        "id,title,description,status,parent_node_id,sort_order,revision,estimated_duration_minutes,map_id,node_id,start_time,end_time",
      )
      .eq("user_id", context.userId)
      .eq("link_review_required", false)
      .order("sort_order")
      .order("created_at");
    if (error)
      throw new Error("Couldn't load tasks. Check that the workflow migration is installed.");
    return (data ?? []) as ActionableTask[];
  });

export const getDolphinProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.dolphinXp) return null;
    const client = context.supabase as unknown as SupabaseClient;
    const { data, error } = await client
      .from("dolphin_profiles")
      .select("confirmed_xp,companion_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load Dolphin progress.");
    // Device widget outboxes are native-only; web pending stays 0 until sync confirms.
    return {
      confirmed_xp: data?.confirmed_xp ?? 0,
      companion_enabled: data?.companion_enabled ?? true,
      pending_xp: 0,
    };
  });

export const setCompanionPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.dolphinXp) throw new Error("Dolphin progression is not enabled.");
    const { error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_companion_preference",
      { p_enabled: data.enabled },
    );
    if (error) throw new Error("Couldn't save preference.");
    return { ok: true };
  });

export const saveActionableTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(500),
        description: z.string().max(10000).default(""),
        parentId: z.string().uuid().nullable(),
        order: z.number().int().nonnegative(),
        estimate: z.number().int().positive().max(10080).nullable(),
        revision: z.number().int().nonnegative(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Task workflow is not enabled.");
    const { data: task, error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_save_task",
      {
        p_id: data.id,
        p_title: data.title,
        p_description: data.description,
        p_parent: data.parentId,
        p_order: data.order,
        p_estimate: data.estimate,
        p_revision: data.revision,
      },
    );
    if (error)
      throw new Error(
        error.message.includes("Undo parent")
          ? "Undo the parent completion before adding steps."
          : "Couldn't save. Refresh and try again.",
      );
    return task as ActionableTask;
  });

export const attachMapNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        nodeId: z.string().uuid(),
        parentId: z.string().uuid().nullable(),
        title: z.string().trim().min(1).max(500),
        noteOnly: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Task workflow is not enabled.");
    const { error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "notio_attach_map_node",
      {
        p_node: data.nodeId,
        p_parent: data.parentId,
        p_title: data.title,
        p_note_only: data.noteOnly,
      },
    );
    if (error) throw new Error("Couldn't save. Check the destination and try again.");
    return { ok: true };
  });

export const getAssignmentNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) return [] as { node_id: string; content: string }[];
    const { data: notes, error } = await (context.supabase as unknown as SupabaseClient)
      .from("assignment_notes")
      .select("node_id,content")
      .eq("user_id", context.userId)
      .eq("assignment_id", data.id);
    if (error) throw new Error("Couldn't load notes.");
    return (notes ?? []) as { node_id: string; content: string }[];
  });

export const seedEssayOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ parentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.workflow) throw new Error("Task workflow is not enabled.");
    const { ESSAY_OUTLINE_STEPS } = await import("./essay-outline");
    const client = context.supabase as unknown as SupabaseClient;
    const { data: existing, error: existingError } = await client
      .from("scheduling_nodes")
      .select("id,title")
      .eq("user_id", context.userId)
      .eq("parent_node_id", data.parentId);
    if (existingError) throw new Error("Couldn't check existing steps.");
    if ((existing ?? []).length > 0) {
      throw new Error("This assignment already has steps. Add more manually if needed.");
    }
    const { data: parent, error: parentError } = await client
      .from("scheduling_nodes")
      .select("id,revision,status")
      .eq("user_id", context.userId)
      .eq("id", data.parentId)
      .maybeSingle();
    if (parentError || !parent) throw new Error("Assignment not found.");
    if (parent.status === "completed") {
      throw new Error("Undo the parent completion before adding steps.");
    }
    for (let i = 0; i < ESSAY_OUTLINE_STEPS.length; i++) {
      const step = ESSAY_OUTLINE_STEPS[i];
      const { error } = await client.rpc("notio_save_task", {
        p_id: crypto.randomUUID(),
        p_title: step.title,
        p_description: "",
        p_parent: data.parentId,
        p_order: i,
        p_estimate: step.estimate,
        p_revision: 0,
      });
      if (error) {
        throw new Error(
          error.message.includes("Undo parent")
            ? "Undo the parent completion before adding steps."
            : "Couldn't create essay steps. Refresh and try again.",
        );
      }
    }
    return { ok: true, count: ESSAY_OUTLINE_STEPS.length };
  });

export const getCompletionExportStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.googleCalendar) return { pending: 0, exhausted: 0 };
    const { data, error } = await (context.supabase as unknown as SupabaseClient)
      .from("completion_export_outbox")
      .select("attempts")
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't load calendar export status.");
    const rows = data ?? [];
    const exhausted = rows.filter((r) => (r.attempts ?? 0) >= 8).length;
    return { pending: rows.length, exhausted };
  });

export const retryCompletionExports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.googleCalendar) return { ok: true, remaining: 0 };
    const { flushCompletionExports } = await import("./task-completion.server");
    await flushCompletionExports(context.userId, { includeExhausted: true });
    const { data } = await (context.supabase as unknown as SupabaseClient)
      .from("completion_export_outbox")
      .select("task_id")
      .eq("user_id", context.userId);
    return { ok: true, remaining: data?.length ?? 0 };
  });
