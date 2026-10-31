/**
 * Google Calendar push/pull sync against scheduling_nodes (server-only).
 * Best-effort: never throws to callers of fire-and-forget paths.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  isGoogleCalendarConfigured,
  listChangedEvents,
  refreshAccessToken,
  updateCalendarEvent,
  type GoogleEventInput,
} from "@/lib/google-calendar.server";

type IntegrationRow = {
  id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  calendar_id: string | null;
  sync_enabled: boolean | null;
  sync_token: string | null;
};

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  is_timebound: boolean | null;
  status: string | null;
  google_event_id: string | null;
  estimated_duration_minutes: number | null;
  location: string | null;
  attendees: string[] | null;
  source?: string | null;
  due_at?: string | null;
};

async function logSync(opts: {
  userId: string;
  integrationId?: string | null;
  action: string;
  eventId?: string | null;
  taskId?: string | null;
  status: "success" | "error" | "skipped";
  errorMessage?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("calendar_sync_log").insert({
      user_id: opts.userId,
      integration_id: opts.integrationId ?? null,
      action: opts.action,
      event_id: opts.eventId ?? null,
      task_id: opts.taskId ?? null,
      status: opts.status,
      error_message: opts.errorMessage ?? null,
      details: opts.details ?? null,
    });
  } catch (e) {
    console.warn("[gcal] sync log failed", e);
  }
}

async function loadIntegration(userId: string): Promise<IntegrationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("calendar_integrations")
    .select(
      "id, user_id, access_token, refresh_token, token_expires_at, calendar_id, sync_enabled, sync_token",
    )
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (error) {
    console.warn("[gcal] load integration", error.message);
    return null;
  }
  return data as IntegrationRow | null;
}

async function getValidAccessToken(row: IntegrationRow): Promise<string | null> {
  if (!row.refresh_token && !row.access_token) return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const stillValid = row.access_token && expiresAt > Date.now() + 60_000;
  if (stillValid) return row.access_token;

  if (!row.refresh_token) return row.access_token;

  try {
    const tokens = await refreshAccessToken(row.refresh_token);
    const expires = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    await supabaseAdmin
      .from("calendar_integrations")
      .update({
        access_token: tokens.access_token,
        token_expires_at: expires,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return tokens.access_token;
  } catch (e) {
    console.warn("[gcal] refresh failed", e);
    return null;
  }
}

async function userTimezone(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("user_working_hours")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.timezone || "UTC";
}

function buildEventInput(task: TaskRow, timeZone: string): GoogleEventInput | null {
  if (!task.start_time || task.is_timebound === false) return null;
  const start = new Date(task.start_time);
  if (Number.isNaN(start.getTime())) return null;

  let end: Date;
  if (task.end_time) {
    end = new Date(task.end_time);
  } else {
    const mins = task.estimated_duration_minutes && task.estimated_duration_minutes > 0
      ? task.estimated_duration_minutes
      : 60;
    end = new Date(start.getTime() + mins * 60_000);
  }
  if (Number.isNaN(end.getTime()) || end <= start) {
    end = new Date(start.getTime() + 60 * 60_000);
  }

  return {
    summary: task.title,
    description: task.description || undefined,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    timeZone,
    notioTaskId: task.id,
    location: task.location?.trim() || undefined,
    attendees: (task.attendees ?? []).filter((e) => typeof e === "string" && e.trim()),
  };
}

async function loadTask(taskId: string): Promise<TaskRow | null> {
  const { data, error } = await supabaseAdmin
    .from("scheduling_nodes")
    .select(
      "id, user_id, title, description, start_time, end_time, is_timebound, status, google_event_id, estimated_duration_minutes, location, attendees, source, due_at",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TaskRow;
}

/**
 * Push one scheduling_nodes row to Google Calendar (create / update / delete).
 * Safe to call fire-and-forget; returns { ok, reason? }.
 */
export async function pushTaskToGoogle(taskId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!FEATURE_FLAGS.googleCalendar || !isGoogleCalendarConfigured()) {
    return { ok: false, reason: "disabled" };
  }

  const task = await loadTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  if (task.source === "canvas" && !task.start_time) {
    return { ok: false, reason: "canvas_unscheduled" };
  }

  const integration = await loadIntegration(task.user_id);
  if (!integration?.refresh_token && !integration?.access_token) {
    return { ok: false, reason: "not_connected" };
  }
  if (integration.sync_enabled === false) {
    await logSync({
      userId: task.user_id,
      integrationId: integration.id,
      action: "push_skipped",
      taskId: task.id,
      status: "skipped",
      details: { reason: "sync_disabled" },
    });
    return { ok: false, reason: "sync_disabled" };
  }

  const accessToken = await getValidAccessToken(integration);
  if (!accessToken) {
    await logSync({
      userId: task.user_id,
      integrationId: integration.id,
      action: "push_failed",
      taskId: task.id,
      status: "error",
      errorMessage: "reconnect_required",
    });
    return { ok: false, reason: "reconnect_required" };
  }

  const calendarId = integration.calendar_id || "primary";
  const timeZone = await userTimezone(task.user_id);

  // Complete or non-pending → remove Google event if present
  if (task.status === "completed" || task.status === "deferred" || task.status === "cancelled") {
    if (task.google_event_id) {
      try {
        await deleteCalendarEvent(accessToken, calendarId, task.google_event_id);
        await supabaseAdmin
          .from("scheduling_nodes")
          .update({ google_event_id: null })
          .eq("id", task.id);
        await logSync({
          userId: task.user_id,
          integrationId: integration.id,
          action: "delete_on_complete",
          eventId: task.google_event_id,
          taskId: task.id,
          status: "success",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await logSync({
          userId: task.user_id,
          integrationId: integration.id,
          action: "delete_on_complete",
          eventId: task.google_event_id,
          taskId: task.id,
          status: "error",
          errorMessage: msg,
        });
        return { ok: false, reason: msg };
      }
    }
    return { ok: true };
  }

  // Untimed tasks never sync
  const input = buildEventInput(task, timeZone);
  if (!input) {
    if (task.google_event_id) {
      try {
        await deleteCalendarEvent(accessToken, calendarId, task.google_event_id);
        await supabaseAdmin
          .from("scheduling_nodes")
          .update({ google_event_id: null })
          .eq("id", task.id);
      } catch {
        /* ignore */
      }
    }
    return { ok: false, reason: "not_timebound" };
  }

  try {
    if (task.google_event_id) {
      await updateCalendarEvent(accessToken, calendarId, task.google_event_id, input);
      await logSync({
        userId: task.user_id,
        integrationId: integration.id,
        action: "update",
        eventId: task.google_event_id,
        taskId: task.id,
        status: "success",
      });
    } else {
      const created = await createCalendarEvent(accessToken, calendarId, input);
      await supabaseAdmin
        .from("scheduling_nodes")
        .update({ google_event_id: created.id })
        .eq("id", task.id);
      await logSync({
        userId: task.user_id,
        integrationId: integration.id,
        action: "create",
        eventId: created.id,
        taskId: task.id,
        status: "success",
      });
    }

    await supabaseAdmin
      .from("calendar_integrations")
      .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", integration.id);

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSync({
      userId: task.user_id,
      integrationId: integration.id,
      action: task.google_event_id ? "update" : "create",
      eventId: task.google_event_id,
      taskId: task.id,
      status: "error",
      errorMessage: msg,
    });
    return { ok: false, reason: msg };
  }
}

/** Delete Google event for a task (after Notio delete). */
export async function deleteGoogleEventForTask(
  userId: string,
  googleEventId: string | null | undefined,
): Promise<void> {
  if (!FEATURE_FLAGS.googleCalendar || !isGoogleCalendarConfigured()) return;
  if (!googleEventId) return;

  const integration = await loadIntegration(userId);
  if (!integration || integration.sync_enabled === false) return;
  const accessToken = await getValidAccessToken(integration);
  if (!accessToken) return;
  const calendarId = integration.calendar_id || "primary";

  try {
    await deleteCalendarEvent(accessToken, calendarId, googleEventId);
    await logSync({
      userId,
      integrationId: integration.id,
      action: "delete",
      eventId: googleEventId,
      status: "success",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSync({
      userId,
      integrationId: integration.id,
      action: "delete",
      eventId: googleEventId,
      status: "error",
      errorMessage: msg,
    });
  }
}

/**
 * Pull Google → Notio for Notio-owned events (extendedProperties.private.notio_task_id).
 * Last-write-wins by updated_at; Notio wins on tie.
 */
export async function pullGoogleChangesForUser(userId: string): Promise<{ updated: number }> {
  if (!FEATURE_FLAGS.googleCalendar || !isGoogleCalendarConfigured()) {
    return { updated: 0 };
  }

  const integration = await loadIntegration(userId);
  if (!integration || integration.sync_enabled === false) return { updated: 0 };

  const accessToken = await getValidAccessToken(integration);
  if (!accessToken) return { updated: 0 };

  const calendarId = integration.calendar_id || "primary";
  let updated = 0;

  try {
    const { items, nextSyncToken } = await listChangedEvents(
      accessToken,
      calendarId,
      integration.sync_token,
    );

    for (const ev of items) {
      const notioTaskId = ev.extendedProperties?.private?.notio_task_id;
      if (!notioTaskId) continue;

      const { data: task } = await supabaseAdmin
        .from("scheduling_nodes")
        .select("id, user_id, title, start_time, end_time, status, google_event_id, updated_at, source")
        .eq("id", notioTaskId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!task) continue;

      const gUpdated = ev.updated ? new Date(ev.updated).getTime() : 0;
      const nUpdated = task.updated_at ? new Date(task.updated_at).getTime() : 0;
      // Notio wins if timestamps equal or Google is older
      if (gUpdated && nUpdated && gUpdated <= nUpdated) continue;

      if (ev.status === "cancelled") {
        await supabaseAdmin
          .from("scheduling_nodes")
          .update({
            status: "deferred",
            google_event_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id);
        updated += 1;
        await logSync({
          userId,
          integrationId: integration.id,
          action: "pull_delete",
          eventId: ev.id,
          taskId: task.id,
          status: "success",
        });
        continue;
      }

      const startIso = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T09:00:00.000Z` : null);
      const endIso = ev.end?.dateTime || ev.end?.date || null;
      if (!startIso) continue;

      const canvasOwned = (task as { source?: string | null }).source === "canvas";
      const patch: Record<string, unknown> = {
        google_event_id: ev.id,
        start_time: startIso,
        is_timebound: Boolean(ev.start?.dateTime),
        updated_at: new Date().toISOString(),
      };
      if (ev.summary && !canvasOwned) patch.title = ev.summary;
      if (endIso) patch.end_time = endIso.includes("T") ? endIso : null;

      await supabaseAdmin.from("scheduling_nodes").update(patch).eq("id", task.id);
      updated += 1;
      await logSync({
        userId,
        integrationId: integration.id,
        action: "pull_update",
        eventId: ev.id,
        taskId: task.id,
        status: "success",
        details: { title: ev.summary, startIso },
      });
    }

    if (nextSyncToken) {
      await supabaseAdmin
        .from("calendar_integrations")
        .update({
          sync_token: nextSyncToken,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSync({
      userId,
      integrationId: integration.id,
      action: "pull",
      status: "error",
      errorMessage: msg,
    });
  }

  return { updated };
}

export async function pullGoogleChangesForAllUsers(): Promise<{ users: number; updated: number }> {
  if (!FEATURE_FLAGS.googleCalendar || !isGoogleCalendarConfigured()) {
    return { users: 0, updated: 0 };
  }

  const { data: rows } = await supabaseAdmin
    .from("calendar_integrations")
    .select("user_id")
    .eq("provider", "google")
    .eq("sync_enabled", true)
    .not("refresh_token", "is", null);

  let users = 0;
  let updated = 0;
  for (const row of rows || []) {
    users += 1;
    const r = await pullGoogleChangesForUser(row.user_id);
    updated += r.updated;
  }
  return { users, updated };
}
