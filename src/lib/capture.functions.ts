import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addDays, addMinutes, set } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { normalizeNaiveLocalToUtc } from "@/lib/zoned-datetime";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStructuredJson } from "@/lib/ai-generation.server";
import { assertCanCreateMap } from "@/lib/billing.functions";
import { radialLayout } from "@/lib/layout";
import { TimeExtractionResultSchema } from "@/lib/scheduling.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

const CaptureInput = z.object({ transcript: z.string().min(2) });

const StructureSchema = z.object({
  title: z.string(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        detail: z.string().optional().default(""),
        parentId: z.string().nullable().optional(),
        priority: z.number().int().min(0).max(3).optional().default(1),
        category: z.string().optional().nullable().default(null),
      })
    )
    .min(1),
});

const STRUCTURE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          detail: { type: "string" },
          parentId: { anyOf: [{ type: "string" }, { type: "null" }] },
          priority: { type: "integer", enum: [0, 1, 2, 3] },
          category: { type: "string" },
        },
        required: ["id", "label", "detail", "parentId", "priority", "category"],
      },
    },
  },
  required: ["title", "nodes"],
} as const;

const ScheduleItemSchema = TimeExtractionResultSchema.extend({
  node_label: z.string().optional(),
});

const ScheduleItemsSchema = z.object({
  items: z.array(ScheduleItemSchema).default([]),
});

const SCHEDULE_ITEMS_PROMPT = `Extract every actionable task or event with timing from the transcript.
Return JSON: { "items": [ { ...fields..., "node_label": "short label matching a mindmap node" } ] }
Each item uses the same fields as a single schedule extraction (title, category, start_time_iso, end_time_iso, estimated_duration_minutes, is_timebound, confidence, interpretation, requires_confirmation, timezone_assumed).
Include ALL distinct tasks mentioned. Match node_label to the task's short name when possible.
If no times mentioned for an item, set start_time_iso/end_time_iso null and is_timebound false.`;

function matchNodeId(
  nodes: { id: string; label: string }[],
  item: { node_label?: string; title: string }
): string | null {
  const keys = [item.node_label, item.title]
    .filter(Boolean)
    .map((s) => s!.toLowerCase().trim());
  for (const key of keys) {
    const exact = nodes.find((n) => n.label.toLowerCase().trim() === key);
    if (exact) return exact.id;
    const partial = nodes.find(
      (n) =>
        n.label.toLowerCase().includes(key) || key.includes(n.label.toLowerCase())
    );
    if (partial) return partial.id;
  }
  return null;
}

function applyItemFallback(
  item: z.infer<typeof ScheduleItemSchema>,
  userNow: Date,
  timezone: string,
  index: number
): z.infer<typeof ScheduleItemSchema> {
  if (item.start_time_iso) return item;

  const base = addDays(userNow, 1);
  const startLocal = set(base, {
    hours: 9,
    minutes: index * 30,
    seconds: 0,
  });
  const startUtc = fromZonedTime(startLocal, timezone);
  const endUtc = addMinutes(startUtc, item.estimated_duration_minutes || 30);

  return {
    ...item,
    start_time_iso: startUtc.toISOString(),
    end_time_iso: endUtc.toISOString(),
    is_timebound: true,
    requires_confirmation: true,
    interpretation: `${item.interpretation} [Auto-scheduled slot ${index + 1}]`,
  };
}

/** One input → mindmap + linked schedule items on the map page. */
export const captureThought = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CaptureInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanCreateMap(context.supabase, context.userId);

    const { data: workingHours } = await context.supabase
      .from("user_working_hours")
      .select("timezone")
      .eq("user_id", context.userId)
      .maybeSingle();

    const timezone = workingHours?.timezone || "UTC";
    const nowIso = new Date().toISOString();
    const userNow = toZonedTime(new Date(nowIso), timezone);

    let structured: z.infer<typeof StructureSchema>;
    let scheduleItems: z.infer<typeof ScheduleItemsSchema>;

    try {
      const [structureRes, scheduleRes] = await Promise.all([
        generateStructuredJson({
          feature: "mindmap",
          maxTokens: 2048,
          jsonSchema: STRUCTURE_JSON_SCHEMA,
          userPrompt: `Turn this stream-of-thought into a mindmap JSON.
Rules: one root (parentId null), 6-14 nodes, short labels, stable ids n1,n2..., priorities 0-3 by task purpose: 3=high (time-sensitive commitments, appointments, client/customer interactions, meetings, interviews, scheduled calls, deadlines due today, or anything the user calls urgent/important), 2=medium (planned work toward ongoing goals - presentations, creative work, reports, projects, content creation, assignments, prep), 1=low (flexible/later tasks - journaling, reading, documentation, admin, organization, optional personal tasks), 0=root/informational. Guidelines only; understand intent, and explicit user urgency always overrides.
Also set "category" on every node: a short lowercase tag (1-2 words) grouping SIMILAR items so they can share a color (e.g. "coaching", "discovery", "health", "admin", "content"). Identical kinds MUST reuse the exact same category string; keep the distinct set small (3-6 total); root uses its own topic.
Transcript:\n"""${data.transcript}"""`,
        }),
        generateStructuredJson({
          feature: "schedule",
          maxTokens: 2048,
          system: SCHEDULE_ITEMS_PROMPT,
          userPrompt: `Current date/time (${timezone}): ${formatInTimeZone(new Date(nowIso), timezone, "yyyy-MM-dd HH:mm:ss XXX")}

Transcript:
"""${data.transcript}"""

Return JSON only: { "items": [...] }`,
        }),
      ]);

      structured = StructureSchema.parse(JSON.parse(structureRes.text));
      scheduleItems = ScheduleItemsSchema.parse(JSON.parse(scheduleRes.text));
    } catch (err) {
      console.error("[captureThought] AI error", err);
      throw err instanceof Error
        ? err
        : new Error("AI is busy right now. Try again in a moment.");
    }

    const layout = radialLayout(
      structured.nodes.map((n) => ({ id: n.id, parent: n.parentId ?? null }))
    );
    const root = structured.nodes.find((n) => !n.parentId) ?? structured.nodes[0];
    const children = structured.nodes.filter((n) => n.id !== root.id);
    const idMap = new Map<string, string>();
    const insertedNodes: { id: string; label: string }[] = [];

    const { data: map, error: mapErr } = await context.supabase
      .from("maps")
      .insert({
        user_id: context.userId,
        title: structured.title,
        transcript: data.transcript,
      })
      .select()
      .single();
    if (mapErr || !map) throw new Error(mapErr?.message ?? "Failed to create map");

    const { data: rootRow, error: rootErr } = await context.supabase
      .from("nodes")
      .insert({
        map_id: map.id,
        user_id: context.userId,
        parent_id: null,
        label: root.label,
        detail: root.detail ?? "",
        x: 0,
        y: 0,
        priority: 0,
      })
      .select()
      .single();
    if (rootErr || !rootRow) throw new Error(rootErr?.message ?? "Failed to create root node");
    idMap.set(root.id, rootRow.id);
    insertedNodes.push({ id: rootRow.id, label: root.label });

    // AI category tags, persisted best-effort after inserts (see note below).
    const categoryByNodeId: Record<string, string> = {};
    if (root.category) categoryByNodeId[rootRow.id] = root.category;

    const remaining = [...children];
    let safety = 0;
    while (remaining.length && safety++ < 50) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const n = remaining[i];
        const parentRealId = idMap.get(n.parentId ?? root.id);
        if (!parentRealId) continue;
        const { x, y } = layout[n.id] ?? { x: 0, y: 0 };
        const { data: row, error } = await context.supabase
          .from("nodes")
          .insert({
            map_id: map.id,
            user_id: context.userId,
            parent_id: parentRealId,
            label: n.label,
            detail: n.detail ?? "",
            x,
            y,
            priority: typeof n.priority === "number" ? n.priority : 1,
          })
          .select()
          .single();
        if (error || !row) throw new Error(error?.message ?? "Failed to create node");
        idMap.set(n.id, row.id);
        insertedNodes.push({ id: row.id, label: n.label });
        if (n.category) categoryByNodeId[row.id] = n.category;
        remaining.splice(i, 1);
      }
    }

    // Persist AI categories best-effort, grouped by category. Kept separate from
    // the inserts so a missing `category` column (migration not yet applied)
    // silently no-ops instead of breaking capture.
    const idsByCategory = new Map<string, string[]>();
    for (const [id, cat] of Object.entries(categoryByNodeId)) {
      const list = idsByCategory.get(cat) ?? [];
      list.push(id);
      idsByCategory.set(cat, list);
    }
    if (idsByCategory.size) {
      try {
        await Promise.all(
          [...idsByCategory.entries()].map(([cat, ids]) =>
            context.supabase.from("nodes").update({ category: cat }).in("id", ids),
          ),
        );
      } catch {
        /* column may not exist yet — ignore */
      }
    }

    const taskNodes = insertedNodes.filter((n) => n.id !== rootRow.id);
    let items = scheduleItems.items;

    if (items.length === 0 && taskNodes.length > 0) {
      items = taskNodes.slice(0, 8).map((n, i) =>
        applyItemFallback(
          {
            title: n.label,
            category: "task",
            start_time_iso: null,
            end_time_iso: null,
            estimated_duration_minutes: 30,
            is_timebound: false,
            confidence: 0.4,
            interpretation: `Task from mindmap: ${n.label}`,
            requires_confirmation: true,
            timezone_assumed: timezone,
            node_label: n.label,
          },
          userNow,
          timezone,
          i
        )
      );
    }

    let scheduledCount = 0;
    for (let i = 0; i < items.length; i++) {
      let item = items[i];
      if (!item.start_time_iso) {
        item = applyItemFallback(item, userNow, timezone, i);
      } else {
        // AI returns naive wall-clock in the account timezone — convert to UTC.
        const startUtc = normalizeNaiveLocalToUtc(item.start_time_iso, timezone);
        const endUtc = normalizeNaiveLocalToUtc(item.end_time_iso, timezone);
        item = {
          ...item,
          start_time_iso: startUtc,
          end_time_iso: endUtc,
          timezone_assumed: timezone,
        };
        if (!item.start_time_iso) {
          item = applyItemFallback(item, userNow, timezone, i);
        }
      }

      const nodeId = matchNodeId(taskNodes, item);

      const { data: inserted, error: schedErr } = await context.supabase
        .from("scheduling_nodes")
        .insert({
          user_id: context.userId,
          map_id: map.id,
          node_id: nodeId,
          title: item.title,
          category: item.category,
          status: "pending",
          is_timebound: item.is_timebound,
          start_time: item.start_time_iso,
          end_time: item.end_time_iso,
          estimated_duration_minutes: item.estimated_duration_minutes,
          extracted_intent: item,
          original_transcript: data.transcript,
          priority: 2,
        })
        .select("id")
        .maybeSingle();

      if (!schedErr && inserted?.id) {
        scheduledCount++;
        if (FEATURE_FLAGS.googleCalendar && item.is_timebound) {
          const { pushTaskToGoogle } = await import("@/lib/google-calendar.sync.server");
          void pushTaskToGoogle(inserted.id).catch(() => undefined);
        }
      }
    }

    return {
      mapId: map.id,
      title: map.title,
      scheduledCount,
    };
  });
