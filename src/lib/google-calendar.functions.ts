/**
 * Google Calendar: OAuth connect/disconnect + scheduled-task writes that push sync.
 * Safe to import from client components (server-only deps are dynamic-imported in handlers).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { SupabaseClient } from "@supabase/supabase-js";

async function gcalConfigured(): Promise<boolean> {
  const { isGoogleCalendarConfigured } = await import("@/lib/google-calendar.server");
  return FEATURE_FLAGS.googleCalendar && isGoogleCalendarConfigured();
}

// ── Status / connect URL ─────────────────────────────────────────────

export const getGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isGoogleCalendarConfigured } = await import("@/lib/google-calendar.server");
    if (!FEATURE_FLAGS.googleCalendar) {
      return {
        enabled: false,
        configured: false,
        connected: false,
        syncEnabled: false,
        calendarId: null as string | null,
        lastSyncAt: null as string | null,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("calendar_integrations")
      .select("calendar_id, sync_enabled, last_sync_at, refresh_token, access_token")
      .eq("user_id", context.userId)
      .eq("provider", "google")
      .maybeSingle();

    return {
      enabled: true,
      configured: isGoogleCalendarConfigured(),
      connected: Boolean(data?.refresh_token || data?.access_token),
      syncEnabled: data?.sync_enabled !== false,
      calendarId: data?.calendar_id ?? null,
      lastSyncAt: data?.last_sync_at ?? null,
    };
  });

export const getGoogleCalendarConnectUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await gcalConfigured())) {
      throw new Error(
        "Google Calendar sync is not enabled. Set FEATURE_GOOGLE_CALENDAR and OAuth credentials.",
      );
    }
    const { signOAuthState } = await import("@/lib/google-calendar.oauth.server");
    const { buildGoogleCalendarAuthUrl } = await import("@/lib/google-calendar.server");
    const state = signOAuthState(context.userId);
    return { url: buildGoogleCalendarAuthUrl(state) };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ removeSyncedEvents: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteCalendarEvent, refreshAccessToken } = await import(
      "@/lib/google-calendar.server"
    );

    const { data: row } = await supabaseAdmin
      .from("calendar_integrations")
      .select("id, access_token, refresh_token, token_expires_at, calendar_id")
      .eq("user_id", context.userId)
      .eq("provider", "google")
      .maybeSingle();

    if (data.removeSyncedEvents && row) {
      let access = row.access_token;
      try {
        if (row.refresh_token) {
          const t = await refreshAccessToken(row.refresh_token);
          access = t.access_token;
        }
      } catch {
        /* proceed with existing access if any */
      }
      if (access) {
        const { data: tasks } = await supabaseAdmin
          .from("scheduling_nodes")
          .select("id, google_event_id")
          .eq("user_id", context.userId)
          .not("google_event_id", "is", null);
        const cal = row.calendar_id || "primary";
        for (const t of tasks || []) {
          if (!(t as { google_event_id?: string }).google_event_id) continue;
          try {
            await deleteCalendarEvent(
              access,
              cal,
              (t as { google_event_id: string }).google_event_id,
            );
          } catch {
            /* best-effort */
          }
        }
        await supabaseAdmin
          .from("scheduling_nodes")
          .update({ google_event_id: null } as Record<string, unknown>)
          .eq("user_id", context.userId)
          .not("google_event_id", "is", null);
      }
    }

    if (row) {
      await supabaseAdmin.from("calendar_integrations").delete().eq("id", row.id);
    }
    return { ok: true };
  });

export const updateGoogleCalendarSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        syncEnabled: z.boolean().optional(),
        calendarId: z.string().min(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.googleCalendar) throw new Error("Feature disabled");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof data.syncEnabled === "boolean") patch.sync_enabled = data.syncEnabled;
    if (data.calendarId) patch.calendar_id = data.calendarId;

    const { error } = await supabaseAdmin
      .from("calendar_integrations")
      .update(patch)
      .eq("user_id", context.userId)
      .eq("provider", "google");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listGoogleCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await gcalConfigured())) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshAccessToken, listCalendars } = await import("@/lib/google-calendar.server");

    const { data: row } = await supabaseAdmin
      .from("calendar_integrations")
      .select("access_token, refresh_token, token_expires_at")
      .eq("user_id", context.userId)
      .eq("provider", "google")
      .maybeSingle();
    if (!row?.refresh_token && !row?.access_token) return [];

    let access = row.access_token;
    try {
      if (row.refresh_token) {
        const t = await refreshAccessToken(row.refresh_token);
        access = t.access_token;
        await supabaseAdmin
          .from("calendar_integrations")
          .update({
            access_token: t.access_token,
            token_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", context.userId)
          .eq("provider", "google");
      }
    } catch {
      /* use existing */
    }
    if (!access) return [];
    return listCalendars(access);
  });

/**
 * Google → Notio pull for the signed-in user.
 * Used by Profile "Sync now" and by the in-app background puller
 * (Hobby Vercel only allows a daily cron, so client-side pull keeps 2-way alive).
 */
export const pullMyGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!FEATURE_FLAGS.googleCalendar) return { ok: false as const, updated: 0, reason: "disabled" };
    const { pullGoogleChangesForUser } = await import("@/lib/google-calendar.sync.server");
    const { updated } = await pullGoogleChangesForUser(context.userId);
    return { ok: true as const, updated };
  });

// ── Task write helpers (DB + Google push) ────────────────────────────

export const syncTaskToGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!FEATURE_FLAGS.googleCalendar) return { ok: false as const, reason: "disabled" };
    const { data: task } = await context.supabase
      .from("scheduling_nodes")
      .select("id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task) throw new Error("Task not found");
    const { pushTaskToGoogle } = await import("@/lib/google-calendar.sync.server");
    return pushTaskToGoogle(data.taskId);
  });

export const completeScheduledTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as SupabaseClient;
    const { data: task, error } = await client
      .from("scheduling_nodes")
      .select("id, revision")
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !task) throw new Error("Task not found");
    try {
      const { commitTaskCompletion } = await import("./task-completion.server");
      const { randomUUID } = await import("node:crypto");
      await commitTaskCompletion(
        context.userId,
        {
          entityId: task.id,
          expectedRevision: typeof task.revision === "number" ? task.revision : 0,
          desiredState: true,
          actionId: randomUUID(),
          source: "plan",
        },
        client,
      );
    } catch {
      const { error: legacyErr } = await client
        .from("scheduling_nodes")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.taskId)
        .eq("user_id", context.userId);
      if (legacyErr) throw new Error(legacyErr.message);
    }

    if (FEATURE_FLAGS.googleCalendar) {
      const { pushTaskToGoogle } = await import("@/lib/google-calendar.sync.server");
      void pushTaskToGoogle(data.taskId).catch(() => undefined);
    }
    return { ok: true };
  });

export const deleteScheduledTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: task } = await context.supabase
      .from("scheduling_nodes")
      .select("id, google_event_id, revision, source")
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!task) throw new Error("Task not found");

    const googleEventId = (task as { google_event_id?: string | null }).google_event_id;
    const revision = typeof task.revision === "number" ? task.revision : 0;

    const tombstone = await context.supabase
      .from("scheduling_nodes")
      .update({ tombstone: true, status: "deferred", revision: revision + 1 })
      .eq("id", data.taskId)
      .eq("user_id", context.userId);
    if (tombstone.error) {
      const { error } = await context.supabase
        .from("scheduling_nodes")
        .delete()
        .eq("id", data.taskId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }

    if (FEATURE_FLAGS.googleCalendar && googleEventId) {
      const { deleteGoogleEventForTask } = await import("@/lib/google-calendar.sync.server");
      void deleteGoogleEventForTask(context.userId, googleEventId).catch(() => undefined);
    }
    return { ok: true };
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeAttendees(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const email = item.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      throw new Error(`Invalid attendee email: ${item.trim()}`);
    }
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

const UpdateTaskInput = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().nullable().optional(),
  isTimebound: z.boolean().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  location: z.string().trim().max(500).nullable().optional(),
  attendees: z.array(z.string()).max(50).optional(),
});

export const updateScheduledTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UpdateTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("scheduling_nodes")
      .select("id, source, start_time")
      .eq("id", data.taskId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!current) throw new Error("Task not found");
    const canvasOwned = current.source === "canvas";

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined && !canvasOwned) patch.title = data.title;

    let startIso: string | undefined;
    if (data.startTime !== undefined) {
      const d = new Date(data.startTime);
      if (Number.isNaN(d.getTime())) throw new Error("Invalid start time");
      startIso = d.toISOString();
      patch.start_time = startIso;
    }

    if (data.durationMinutes !== undefined) {
      patch.estimated_duration_minutes = data.durationMinutes;
      // Prefer explicit start from this request; else load current start.
      let startMs: number | null = startIso ? new Date(startIso).getTime() : null;
      if (startMs == null) {
        const { data: row } = await context.supabase
          .from("scheduling_nodes")
          .select("start_time")
          .eq("id", data.taskId)
          .maybeSingle();
        if (row?.start_time) startMs = new Date(row.start_time).getTime();
      }
      if (startMs != null && !Number.isNaN(startMs)) {
        patch.end_time = new Date(startMs + data.durationMinutes * 60_000).toISOString();
      }
    } else if (data.endTime !== undefined) {
      if (data.endTime === null) patch.end_time = null;
      else {
        const d = new Date(data.endTime);
        if (Number.isNaN(d.getTime())) throw new Error("Invalid end time");
        patch.end_time = d.toISOString();
      }
    }

    if (data.isTimebound !== undefined) patch.is_timebound = data.isTimebound;
    if (data.location !== undefined) {
      patch.location = data.location === null || data.location === "" ? null : data.location;
    }
    if (data.attendees !== undefined) {
      patch.attendees = normalizeAttendees(data.attendees);
    }

    const { error } = await context.supabase
      .from("scheduling_nodes")
      .update(patch)
      .eq("id", data.taskId);
    if (error) throw new Error(error.message);

    if (FEATURE_FLAGS.googleCalendar) {
      const { pushTaskToGoogle } = await import("@/lib/google-calendar.sync.server");
      void pushTaskToGoogle(data.taskId).catch(() => undefined);
    }
    return { ok: true };
  });
