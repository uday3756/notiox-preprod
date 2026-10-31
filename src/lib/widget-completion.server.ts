import { createClient } from "@supabase/supabase-js";
import { FEATURE_FLAGS } from "./feature-flags";
import { commitTaskCompletion, TaskCompletionError } from "./task-completion.server";
import { completionCommand } from "./task-completion.types";
import { levelForXp } from "./dolphin-progression";
import { logicalDate, normalizeRingSettings } from "./rings/day";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function handleWidgetRequest(request: Request) {
  if (!FEATURE_FLAGS.workflow || !FEATURE_FLAGS.nativeWidgets)
    return json({ error: "disabled" }, 404);
  const url = new URL(request.url);
  const snapshot = url.pathname === "/api/v1/widgets/snapshot";
  const completion = url.pathname === "/api/v1/widgets/completion";
  if (!snapshot && !completion) return json({ error: "not_found" }, 404);
  if (request.method !== (snapshot ? "GET" : "POST"))
    return json({ error: "method_not_allowed" }, 405);
  const token = request.headers.get("Authorization");
  if (!token?.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
  const endpoint = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!endpoint || !key) return json({ error: "not_configured" }, 503);
  const client = createClient(endpoint, key, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser(token.slice(7));
  if (authError || !user) return json({ error: "auth_required" }, 401);
  try {
    if (completion) {
      const text = await request.text();
      if (text.length > 4096) return json({ error: "invalid_command" }, 400);
      const input = completionCommand.safeParse(JSON.parse(text));
      if (!input.success) return json({ error: "invalid_command" }, 400);
      const result = await commitTaskCompletion(user.id, input.data, client);
      return json({ version: 1, accountId: user.id, ...result });
    }
    const { data: hours, error: hoursError } = await client
      .from("user_working_hours")
      .select("timezone,day_start_hour,block_boundaries,daily_task_estimate")
      .eq("user_id", user.id)
      .maybeSingle();
    if (hoursError) throw hoursError;
    const settings = normalizeRingSettings(hours),
      today = logicalDate(new Date(), settings.timezone, settings.day_start_hour);
    const { data: tasks, error } = await client
      .from("scheduling_nodes")
      .select("id,title,revision,parent_node_id,status,start_time,estimated_duration_minutes")
      .eq("user_id", user.id)
      .eq("link_review_required", false)
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    const parents = new Set((tasks ?? []).map((t) => t.parent_node_id).filter(Boolean));
    const pinned = url.searchParams.get("assignment");
    const visible = (tasks ?? [])
      .filter(
        (t) =>
          t.status !== "completed" &&
          !parents.has(t.id) &&
          (pinned
            ? t.parent_node_id === pinned
            : !t.start_time ||
              logicalDate(t.start_time, settings.timezone, settings.day_start_hour) === today),
      )
      .slice(0, 6);
    const { data: progress, error: progressError } = FEATURE_FLAGS.dolphinXp
      ? await client
          .from("dolphin_profiles")
          .select("confirmed_xp,companion_enabled")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null, error: null };
    if (progressError) throw progressError;
    return json({
      version: 1,
      accountId: user.id,
      generatedAt: new Date().toISOString(),
      confirmedXp: progress?.confirmed_xp ?? 0,
      level: levelForXp(progress?.confirmed_xp ?? 0),
      companionEnabled: progress?.companion_enabled ?? true,
      tasks: visible.map((t) => ({
        id: t.id,
        title: t.title,
        revision: t.revision,
        completed: false,
        estimate: t.estimated_duration_minutes,
        parentTitle: (tasks ?? []).find((p) => p.id === t.parent_node_id)?.title ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "invalid_command" }, 400);
    if (error instanceof TaskCompletionError && error.status !== 503)
      return json(
        { error: error.status === 404 ? "task_removed" : "conflict", refresh: true },
        error.status,
      );
    if (error instanceof Error && error.message.includes("another device"))
      return json({ error: "conflict", refresh: true }, 409);
    return json({ error: "temporarily_unavailable", retry: true }, 503);
  }
}
