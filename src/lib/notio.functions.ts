import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAnthropicClient, Notio_MODEL } from "@/lib/anthropic.server";
import { assertCanCreateMap } from "@/lib/billing.functions";
import { radialLayout } from "@/lib/layout";
import { logicalDate } from "@/lib/rings/day";

const StructureSchema = z.object({
  title: z.string(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        detail: z.string().optional().default(""),
        parentId: z.string().nullable().optional(),
        priority: z.coerce.number().int().min(0).max(3).optional().default(1),
        category: z.string().optional().nullable().default(null),
        time_block: z
          .enum(["morning", "afternoon", "evening", "unknown"])
          .optional()
          .default("unknown"),
        time_block_confidence: z.enum(["high", "low"]).optional().default("low"),
      }),
    )
    .min(1),
});

// JSON Schema handed to Claude's structured-output mode. All fields are required
// here (the model always fills them); we relax/normalise afterwards with Zod.
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
          time_block: {
            type: "string",
            enum: ["morning", "afternoon", "evening", "unknown"],
          },
          time_block_confidence: { type: "string", enum: ["high", "low"] },
        },
        required: [
          "id",
          "label",
          "detail",
          "parentId",
          "priority",
          "category",
          "time_block",
          "time_block_confidence",
        ],
      },
    },
  },
  required: ["title", "nodes"],
} as const;

const StructureInput = z.object({
  transcript: z.string().min(2),
  // Optional talking-style hint derived LOCAL-ONLY on the client and passed
  // per-request (never stored server-side). Used to match the user's phrasing.
  style: z.string().max(600).optional(),
  persist: z.boolean().optional(),
  captureRequestId: z.string().uuid().optional(),
});

const SaveStructuredInput = z.object({
  transcript: z.string().min(2),
  captureRequestId: z.string().uuid(),
  title: z.string().min(1).max(500),
  nodes: StructureSchema.shape.nodes,
});

// Never assume clean JSON from an LLM. Structured-output mode usually returns
// pure JSON, but if the model wraps it in prose or ``` fences we slice out the
// object between the first "{" and the last "}" before parsing.
function safeParseMap(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const json = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(json);
}

// Turn an internal error into a specific, actionable user message instead of a
// blanket "AI is busy" catch-all.
function friendlyMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (
    msg.includes("invalid") &&
    (msg.includes("api key") || msg.includes("authentication"))
  ) {
    return "Anthropic API key is invalid. Update ANTHROPIC_API_KEY in .env and restart the server.";
  }
  if (msg.includes("missing anthropic_api_key") || msg.includes("missing api key")) {
    return "ANTHROPIC_API_KEY is missing from .env. Add it and restart the server.";
  }
  if (msg.includes("401") || msg.includes("authentication_error") || msg.includes("auth")) {
    return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env, then restart npm run dev.";
  }
  if (msg.includes("timeout") || msg.includes("aborted")) {
    return "That took too long. Try a shorter thought or try again.";
  }
  if (msg.includes("rate") || msg.includes("429")) {
    return "Too many requests right now. Wait a moment and try again.";
  }
  if (msg.includes("overloaded") || msg.includes("529")) {
    return "The AI is busy right now. Please try again in a moment.";
  }
  if (msg.includes("credit") || msg.includes("billing") || msg.includes("quota")) {
    return "The AI service is temporarily unavailable. Please contact support.";
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("connect")) {
    return "Couldn't reach the AI service. Check your connection and try again.";
  }
  if (msg.includes("json") || msg.includes("parse") || msg.includes("no nodes")) {
    return "Couldn't structure that. Try rephrasing your thought.";
  }
  return "Something went wrong building your map. Try again.";
}

export async function generateStructuredThought(data: z.infer<typeof StructureInput>) {
    const anthropic = createAnthropicClient();

    // Claude-only. JSON shape enforced via output_config.format (json_schema).
    // Stable rules (no per-request data) → cached system prefix. Per-user style
    // and the transcript go in the user message so the cache prefix is identical
    // across calls and bills at ~10% after the first request.
    const MINDMAP_RULES = `You turn a person's spoken stream-of-thought into a clean mindmap.

The transcript comes from speech-to-text (often mobile, which is less accurate than
desktop). The speaker may have a strong English accent (e.g. Indian, Latino/Spanish,
Brazilian Portuguese, or US Southern), so it can contain misheard words.

BEFORE mapping, silently correct likely STT errors from context. Common examples:
"waiting" when they meant "meeting" ("having waiting" → "having a meeting"),
garbled times/dates, and similar near-homophones. Preserve the speaker's meaning
and their own wording. Do not add new ideas or drop content.

Rules:
- One root node (parentId = null) summarising the overall topic.
- Each DISTINCT idea, task, or subtopic becomes a child node, grouped under the most relevant parent.
- Do NOT split a single item into separate nodes for its attributes. A meeting's
  time, date, location, participants, and duration all belong in that ONE node's
  label and "detail" — never as their own child nodes. E.g. "meeting with my
  client from the USA at 9 PM" is ONE node ("Client meeting - 9 PM", detail
  "With USA client"), not separate "Meeting time" / "Client location" nodes.
- Keep labels short (2-6 words), e.g. "Pick up rental suit", "Salon haircut", "Sangeet".
  Move times, places, and extra context into "detail".
  NEVER use raw transcript fragments as labels ("half past four I must go",
  "next Saturday next Sunday", "all of this on my calendar").
- Use stable string ids like "n1", "n2", ...
- Scale the number of nodes to the input: a single short thought may need only
  1-3 nodes; a longer brain-dump (wedding plans, travel days, multi-task schedules)
  can have up to ~18 nodes — one per distinct task/event. Never pad with filler.
- Set "priority" on every node by reasoning about the PURPOSE of each task, not by matching specific words or brands:
  - 3 = high: time-sensitive commitments, appointments, client or customer interactions, meetings, interviews, scheduled calls, deadlines due today, or anything the user explicitly describes as urgent or important. Use 3 sparingly (at most 2 nodes).
  - 2 = medium: planned work that contributes to ongoing goals - presentations, creative work, reports, project work, content creation, assignments, or preparation tasks.
  - 1 = low: flexible tasks that can usually be done later - journaling, reading, documentation, administrative work, organization, or optional personal tasks.
  - 0 = informational; the root node priority is always 0.
  These are guidelines only. Understand the user's intent and context before assigning priority. If the user explicitly states a task is urgent or important, that overrides the default guidance.
- Set "category" on every node: a short lowercase tag (1-2 words) that groups SIMILAR items so they can share a color — e.g. "coaching", "discovery", "health", "admin", "content", "personal". Nodes about the same kind of thing MUST reuse the exact same category string (all coaching calls → "coaching"). Keep the set of distinct categories small (aim for 3-6 across the map). Use the root node's own topic as its category.
- Set "time_block" on every TASK node (children) to morning | afternoon | evening | unknown:
  - Use explicit times/markers in the user's OWN language first ("at 3pm", "tonight", "before bed", "first thing", "comida", "cena", "goûter", evening tea, etc.). Do NOT translate to English before classifying.
  - Default blocks if hours are unclear: morning ≈ before noon, afternoon ≈ noon–5pm, evening ≈ after 5pm (user-local sense).
  - Root node may be "unknown". Prefer "unknown" + low confidence over guessing when there is no cue.
  - Set "time_block_confidence" to "high" when time/marker is clear, otherwise "low".
`;

    const promptBody = `${data.style ? `Match THIS user's phrasing style when labeling nodes: ${data.style}\n\n` : ""}Transcript:
"""${data.transcript}"""`;

    let structured: z.infer<typeof StructureSchema>;
    let rawText = "";

    const transcriptLen = data.transcript.length;
    // Long brain-dumps need more output tokens + wall time or JSON truncates / times out.
    const maxTokens = transcriptLen > 700 ? 6144 : transcriptLen > 350 ? 4096 : 2048;
    const anthropicTimeoutMs = transcriptLen > 700 ? 55_000 : transcriptLen > 350 ? 40_000 : 28_000;

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        p.then(
          (v) => {
            clearTimeout(t);
            resolve(v);
          },
          (e) => {
            clearTimeout(t);
            reject(e);
          },
        );
      });

    try {
      const message = await withTimeout(
        anthropic.messages.create({
          model: Notio_MODEL,
          max_tokens: maxTokens,
          // Disable Sonnet 5's default thinking: this is a latency-bounded
          // structured-output call, so keep the whole budget for the JSON.
          thinking: { type: "disabled" },
          output_config: {
            format: { type: "json_schema", schema: STRUCTURE_JSON_SCHEMA },
          },
          // Cache the stable rules prefix (~10% cost on repeat captures).
          system: [
            { type: "text", text: MINDMAP_RULES, cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: promptBody }],
        }),
        anthropicTimeoutMs,
        "Claude structureThought",
      );

      rawText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      structured = StructureSchema.parse(safeParseMap(rawText));
      if (!structured.nodes.length) throw new Error("Model returned no nodes");
    } catch (claudeErr) {
      console.error("[structureThought] Claude failed:", {
        message: claudeErr instanceof Error ? claudeErr.message : String(claudeErr),
        transcriptLen,
      });
      throw new Error(friendlyMessage(claudeErr));
    }

    return structured;
}

export const previewThought = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => StructureInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanCreateMap(context.supabase, context.userId);
    const structured = await generateStructuredThought(data);
    return { persisted: false as const, title: structured.title, nodes: structured.nodes };
  });

async function persistStructuredMap(
  context: { supabase: { from: (t: string) => any }; userId: string },
  data: { transcript: string; title: string; nodes: z.infer<typeof StructureSchema>["nodes"]; captureRequestId?: string },
) {
    if (data.captureRequestId) {
      try {
        const existing = await context.supabase
          .from("maps")
          .select("id, title")
          .eq("user_id", context.userId)
          .eq("capture_request_id", data.captureRequestId)
          .maybeSingle();
        if (existing.data?.id) return { mapId: existing.data.id as string, title: existing.data.title as string };
      } catch {
        /* column may be missing until migration */
      }
    }

    const structured = { title: data.title, nodes: data.nodes };
    // Clean, non-overlapping radial layout (positions keyed by temp id).
    const layout = radialLayout(
      structured.nodes.map((n) => ({ id: n.id, parent: n.parentId ?? null })),
    );
    const root = structured.nodes.find((n) => !n.parentId) ?? structured.nodes[0];
    const children = structured.nodes.filter((n) => n.id !== root.id);
    const idMap = new Map<string, string>();

    const insertRow: Record<string, unknown> = {
      user_id: context.userId,
      title: structured.title,
      transcript: data.transcript,
    };
    if (data.captureRequestId) insertRow.capture_request_id = data.captureRequestId;

    let map: { id: string; title: string } | null = null;
    const first = await context.supabase.from("maps").insert(insertRow).select("id, title").single();
    if (first.error && data.captureRequestId && /capture_request_id/i.test(first.error.message)) {
      delete insertRow.capture_request_id;
      const retry = await context.supabase.from("maps").insert(insertRow).select("id, title").single();
      if (retry.error || !retry.data) throw new Error(retry.error?.message ?? "Failed to create map");
      map = retry.data;
    } else if (first.error || !first.data) {
      throw new Error(first.error?.message ?? "Failed to create map");
    } else {
      map = first.data;
    }

    // Root
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

    // Collect AI category tags to persist AFTER the core inserts (see below).
    const categoryByNodeId: Record<string, string> = {};
    if (root.category) categoryByNodeId[rootRow.id] = root.category;
    const timeBlockByNodeId: Record<string, { block: string; source: string }> = {};

    // Two-pass: parents first (those whose parent is root or unknown), then rest
    const remaining = [...children];
    let safety = 0;
    while (remaining.length && safety++ < 50) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const n = remaining[i];
        const parentTempId = n.parentId ?? root.id;
        const parentRealId = idMap.get(parentTempId);
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
        if (n.category) categoryByNodeId[row.id] = n.category;
        if (n.time_block && n.time_block !== "unknown") {
          timeBlockByNodeId[row.id] = {
            block: n.time_block,
            source: n.time_block_confidence === "high" ? "explicit" : "inferred",
          };
        }
        remaining.splice(i, 1);
      }
    }

    // Persist AI categories best-effort, grouped by category (one UPDATE each).
    // Kept SEPARATE from the inserts on purpose: if the `category` column isn't
    // present yet (node-color migration not applied), this silently no-ops
    // instead of breaking map creation. Once the migration lands, tags persist.
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

    // Persist time_block best-effort (Daily Rings).
    if (Object.keys(timeBlockByNodeId).length) {
      try {
        // Stamp logical_date as "today" in the user's TZ so open tasks count on Home rings.
        let logicalToday: string | null = null;
        try {
          const { data: hours } = await context.supabase
            .from("user_working_hours")
            .select("timezone, day_start_hour")
            .eq("user_id", context.userId)
            .maybeSingle();
          const tz = hours?.timezone || "UTC";
          const dayStart = typeof hours?.day_start_hour === "number" ? hours.day_start_hour : 4;
          logicalToday = logicalDate(new Date(), tz, dayStart);
        } catch {
          /* ignore */
        }

        await Promise.all(
          Object.entries(timeBlockByNodeId).map(([id, meta]) =>
            context.supabase
              .from("nodes")
              .update({
                time_block: meta.block,
                time_block_source: meta.source,
                ...(logicalToday ? { logical_date: logicalToday } : {}),
              } as never)
              .eq("id", id),
          ),
        );
      } catch {
        /* ignore */
      }
    }

    return { mapId: map.id, title: map.title };
}

export const saveStructuredMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SaveStructuredInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanCreateMap(context.supabase, context.userId);
    return persistStructuredMap(context, data);
  });

export const structureThought = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => StructureInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanCreateMap(context.supabase, context.userId);
    const structured = await generateStructuredThought(data);
    if (data.persist === false) {
      return { persisted: false as const, title: structured.title, nodes: structured.nodes, mapId: undefined };
    }
    return persistStructuredMap(context, {
      transcript: data.transcript,
      title: structured.title,
      nodes: structured.nodes,
      captureRequestId: data.captureRequestId,
    });
  });

const SetPriorityInput = z.object({
  nodeId: z.string().uuid(),
  priority: z.number().int().min(0).max(3),
});

export const setNodePriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SetPriorityInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("nodes")
      .update({ priority: data.priority })
      .eq("id", data.nodeId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

