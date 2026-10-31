import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURE_FLAGS } from "./feature-flags";
import { isAppRole } from "./app-role";
import { canvasDisplayState, classifyCanvasFailure } from "./canvas-policy";
import { createDirectCanvasSource, normalizeDomain } from "./canvas-api.server";
import { decryptCanvasToken, encryptCanvasToken } from "./canvas-crypto.server";
import type { CanvasAssignment } from "./canvas.types";

function adminClient() {
  return import("@/integrations/supabase/client.server").then(
    (m) => m.supabaseAdmin as unknown as SupabaseClient,
  );
}

function metaAppRole(claims: unknown): string | undefined {
  if (!claims || typeof claims !== "object") return undefined;
  const c = claims as Record<string, unknown>;
  const userMeta = c.user_metadata;
  if (userMeta && typeof userMeta === "object" && "notio_app_role" in userMeta) {
    return String((userMeta as { notio_app_role?: unknown }).notio_app_role);
  }
  if (typeof c.notio_app_role === "string") return c.notio_app_role;
  return undefined;
}

/** Canvas pilot: feature flag OR student app role (same Notiolive app). */
async function canvasEnabledFor(
  userId: string,
  claims: unknown,
  client: SupabaseClient,
): Promise<boolean> {
  if (FEATURE_FLAGS.canvasPilot) return true;
  if (metaAppRole(claims) === "student") return true;
  const { data } = await client.from("profiles").select("app_role").eq("id", userId).maybeSingle();
  return data?.app_role === "student" && isAppRole(data.app_role);
}

export const getCanvasStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const enabled = await canvasEnabledFor(context.userId, context.claims, client);
    if (!enabled) return { enabled: false as const };
    const { data, error } = await client
      .from("canvas_connections")
      .select("id,domain,institution,state,last_successful_sync,last_error,connection_generation")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) {
      return {
        enabled: true as const,
        configured: false as const,
        error: "Couldn't load Canvas connection. Apply the canvas migration first.",
      };
    }
    return {
      enabled: true as const,
      configured: true as const,
      connection: data,
    };
  });

export const connectCanvas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        domain: z.string().trim().min(3).max(200),
        token: z.string().trim().min(10).max(5000),
        institution: z.string().trim().min(1).max(200).default("Canvas"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    if (!(await canvasEnabledFor(context.userId, context.claims, client))) {
      throw new Error("Canvas is for Student accounts. Switch role in Profile.");
    }
    const domain = normalizeDomain(data.domain);
    const admin = await adminClient();
    // Verify token with a health call before storing.
    const probe = await fetch(`https://${domain}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${data.token}`, Accept: "application/json" },
    });
    if (probe.status === 401 || probe.status === 403) {
      throw new Error("Canvas rejected that token. Create a student access token and try again.");
    }
    if (!probe.ok) {
      throw new Error(`Couldn't reach Canvas (${probe.status}). Check the school domain.`);
    }
    const ciphertext = encryptCanvasToken(data.token);
    const { data: row, error } = await admin
      .from("canvas_connections")
      .upsert(
        {
          user_id: context.userId,
          domain,
          institution: data.institution,
          token_ciphertext: ciphertext,
          state: "connected",
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,domain" },
      )
      .select("id,domain,institution,state,last_successful_sync")
      .single();
    if (error) throw new Error("Couldn't save Canvas connection. Apply migrations first.");
    return row;
  });

export const disconnectCanvas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    if (!(await canvasEnabledFor(context.userId, context.claims, client))) {
      throw new Error("Canvas is for Student accounts. Switch role in Profile.");
    }
    const admin = await adminClient();
    // Keep imported assignment rows marked not syncing; drop credential row.
    await admin
      .from("canvas_connections")
      .update({
        state: "disconnected",
        token_ciphertext: encryptCanvasToken("revoked"),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);
    const { error } = await admin.from("canvas_connections").delete().eq("user_id", context.userId);
    if (error) throw new Error("Couldn't disconnect Canvas.");
    return { ok: true };
  });

export const syncCanvas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    if (!(await canvasEnabledFor(context.userId, context.claims, client))) {
      throw new Error("Canvas is for Student accounts. Switch role in Profile.");
    }
    const admin = await adminClient();
    const { data: connection, error } = await admin
      .from("canvas_connections")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !connection) throw new Error("Connect Canvas first.");
    const generation = connection.connection_generation as number;
    await admin
      .from("canvas_connections")
      .update({ state: "syncing", updated_at: new Date().toISOString() })
      .eq("id", connection.id);

    const source = createDirectCanvasSource(async () => ({
      id: connection.id,
      domain: connection.domain,
      institution: connection.institution,
      generation,
      token: decryptCanvasToken(connection.token_ciphertext),
    }));

    try {
      const page = await source.readAssignmentPage(connection.id);
      const { data: still } = await admin
        .from("canvas_connections")
        .select("connection_generation")
        .eq("id", connection.id)
        .maybeSingle();
      if (!still || still.connection_generation !== generation) {
        return { ok: false, reason: "stale_generation" as const };
      }

      let upserted = 0;
      for (const item of page.items) {
        const { data: existing } = await admin
          .from("canvas_assignments")
          .select("id,official_due_at,task_id")
          .eq("user_id", context.userId)
          .eq("institution", item.institution)
          .eq("course_id", item.courseId)
          .eq("assignment_id", item.assignmentId)
          .maybeSingle();

        const dueChanged =
          existing?.official_due_at &&
          item.officialDueAt &&
          existing.official_due_at !== item.officialDueAt;

        let taskId = existing?.task_id as string | null;
        if (!taskId) {
          const { data: task } = await admin
            .from("scheduling_nodes")
            .insert({
              user_id: context.userId,
              title: item.title,
              description: `Canvas · ${item.sourceUrl}`,
              status: "pending",
              start_time: item.officialDueAt,
              sort_order: 0,
            })
            .select("id")
            .single();
          taskId = task?.id ?? null;
        } else if (item.officialDueAt) {
          await admin
            .from("scheduling_nodes")
            .update({ title: item.title, start_time: item.officialDueAt })
            .eq("id", taskId)
            .eq("user_id", context.userId);
        }

        await admin.from("canvas_assignments").upsert(
          {
            user_id: context.userId,
            connection_id: connection.id,
            institution: item.institution,
            course_id: item.courseId,
            assignment_id: item.assignmentId,
            source_url: item.sourceUrl,
            title: item.title,
            official_due_at: item.officialDueAt,
            personal_due_at: null,
            submission: item.submission,
            previous_official_due_at: dueChanged ? existing?.official_due_at : null,
            deadline_changed_at: dueChanged ? new Date().toISOString() : null,
            last_successful_sync: new Date().toISOString(),
            task_id: taskId,
          },
          { onConflict: "user_id,institution,course_id,assignment_id" },
        );
        upserted += 1;
      }

      await admin
        .from("canvas_connections")
        .update({
          state: "connected",
          last_successful_sync: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return { ok: true as const, upserted };
    } catch (e) {
      const status = typeof e === "object" && e && "status" in e ? Number((e as { status: number }).status) : 500;
      const state = classifyCanvasFailure(status);
      await admin
        .from("canvas_connections")
        .update({
          state,
          last_error: e instanceof Error ? e.message : "Canvas sync failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
      throw new Error(e instanceof Error ? e.message : "Canvas sync failed");
    }
  });

export const listCanvasAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    if (!(await canvasEnabledFor(context.userId, context.claims, client))) {
      return [] as Array<CanvasAssignment & { display?: ReturnType<typeof canvasDisplayState> }>;
    }
    const { data, error } = await client
      .from("canvas_assignments")
      .select(
        "institution,course_id,assignment_id,source_url,title,official_due_at,personal_due_at,submission,last_successful_sync,previous_official_due_at,deadline_changed_at",
      )
      .eq("user_id", context.userId)
      .order("official_due_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error("Couldn't load Canvas assignments.");
    return (data ?? []).map((row) => {
      const item: CanvasAssignment = {
        institution: row.institution,
        courseId: row.course_id,
        assignmentId: row.assignment_id,
        sourceUrl: row.source_url,
        title: row.title,
        officialDueAt: row.official_due_at,
        personalDueAt: row.personal_due_at,
        submission: row.submission,
        lastSuccessfulSync: row.last_successful_sync,
        previousOfficialDueAt: row.previous_official_due_at,
        deadlineChangedAt: row.deadline_changed_at,
      };
      return { ...item, display: canvasDisplayState(item) };
    });
  });
