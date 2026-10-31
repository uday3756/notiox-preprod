/**
 * Feature 2 — Weekly Reflection Report: server functions.
 *
 * generateWeeklyReportForUser — runs the full pipeline for one user:
 *   1. Assemble the week's daily_wins, completed-task count, and RAG snippets
 *      (via embeddings.server.ts).
 *   2. Call Claude Haiku 4.5 with the tone-ruled system prompt.
 *   3. Run the post-generation tone filter. If it fails, regenerate once
 *      with a stricter reminder. If it fails again, fall back to a safe
 *      template (wins + count + a single neutral reflection question) so the
 *      user always gets something safe.
 *   4. Persist to weekly_reports (cache — 1/user/week).
 *
 * getLatestReport / listReports — read for the in-app card and full-page view.
 *
 * Called by the cron handler (cron-weekly-report.server.ts) and by a manual
 * "regenerate" server fn below for testing.
 */
import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAnthropicClient, Notio_MODEL } from "@/lib/anthropic.server";
import {
  WeeklyReportContentSchema,
  buildWeeklyReportSystemPrompt,
  buildWeeklyReportUserMessage,
  findToneViolations,
  renderReportText,
  type WeeklyReportContent,
} from "@/lib/weekly-report.server";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

// ------------------------------------------------------------------
// Helpers — assemble the week's context for one user
// ------------------------------------------------------------------

function weekRange(now: Date): { start: Date; end: Date } {
  // Last 7 days ending today (inclusive). The cron runs on the user's
  // configured day, so "this week" = the 7 days leading up to today.
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function assembleContext(userId: string, now: Date) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { start, end } = weekRange(now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Fetch wins WITH their local_date so we can count distinct active days.
  // Completed tasks come back with completed_at (timestamptz) — we convert to
  // the user's local date below to merge into the same active-day set.
  const [winsRes, completedRes] = await Promise.all([
    supabaseAdmin
      .from("daily_wins")
      .select("win_text, local_date")
      .eq("user_id", userId)
      .gte("local_date", localDateStr(start))
      .lte("local_date", localDateStr(end))
      .order("local_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("scheduling_nodes")
      .select("id, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", startIso)
      .lte("completed_at", endIso),
  ]);

  const winRows = (winsRes.data ?? []) as { win_text: string; local_date: string }[];
  const wins = winRows.map((w) => w.win_text);
  const completedCount = completedRes.count ?? 0;

  // Count distinct active days: union of win local_dates and completed-task
  // local_dates (derived from completed_at). Capped at 7 by definition since
  // the week window is 7 days.
  const activeDays = new Set<string>();
  for (const w of winRows) {
    if (w.local_date) activeDays.add(w.local_date);
  }
  for (const row of (completedRes.data ?? []) as { completed_at: string | null }[]) {
    if (row.completed_at) {
      // completed_at is timestamptz; slice to YYYY-MM-DD (UTC date — close
      // enough for "days active" counting; exact local-date conversion would
      // need the user's timezone, which we don't fetch here to keep the
      // query cheap).
      activeDays.add(row.completed_at.slice(0, 10));
    }
  }
  const daysActive = Math.min(activeDays.size, 7);

  // RAG: retrieve the most relevant node texts from the past week. The query
  // is the user's wins joined together (so we find nodes related to what they
  // already feel good about). Returns [] if embeddings aren't configured OR
  // the crossMapRag feature flag is off (Phase 2 runs without RAG; Phase 3
  // flips it on). Dynamic import keeps embeddings.server (which transitively
  // imports the service-role client) out of the client bundle — same
  // convention as scheduling.functions.ts.
  let ragSnippets: string[] = [];
  if (FEATURE_FLAGS.crossMapRag) {
    const queryText = wins.length ? wins.join(". ") : "weekly themes";
    const { retrieveRelevantNodes } = await import("@/lib/embeddings.server");
    const rag = await retrieveRelevantNodes({
      userId,
      queryText,
      sinceIso: startIso,
      untilIso: endIso,
      limit: 8,
    });
    ragSnippets = rag.map((r) => r.text);
  }

  return {
    weekStart: localDateStr(start),
    weekEnd: localDateStr(end),
    wins,
    completedCount,
    daysActive,
    ragSnippets,
  };
}

// ------------------------------------------------------------------
// LLM call + tone-filtered regeneration
// ------------------------------------------------------------------

function safeParseJson(raw: string): unknown {
  // Same brace-matching approach as scheduling.functions.ts — robust to
  // stray text around the JSON object.
  const text = raw.trim();
  let start = -1;
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let jsonStr = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escapeNext) { jsonStr += c; escapeNext = false; continue; }
    if (c === "\\") { jsonStr += c; escapeNext = true; continue; }
    if (c === '"') { inString = !inString; }
    if (!inString) {
      if (c === "{") {
        if (start === -1) start = i;
        braceCount++;
      } else if (c === "}") {
        braceCount--;
        if (braceCount === 0 && start !== -1) {
          jsonStr = text.slice(start, i + 1);
          break;
        }
      }
    }
  }
  if (!jsonStr) jsonStr = text;
  return JSON.parse(jsonStr);
}

function safeFallbackContent(
  wins: string[],
  completedCount: number,
  daysActive: number,
): WeeklyReportContent {
  // Used when both LLM passes fail the tone filter. Strictly safe: no
  // suggestions, no inferences — just the user's own wins, the count, and a
  // single neutral reflection question.
  const base: WeeklyReportContent = {
    wins,
    completed_count: completedCount,
    days_active: daysActive,
    focus_areas: [],
    reflection_question: "What's one small thing you'd like to try this week?",
  };
  if (daysActive === 0) {
    base.motivational_note =
      "This week is a fresh start. One small win tomorrow counts — pick something that takes two minutes.";
  }
  return base;
}

async function generateWithFilter(params: {
  anthropic: Anthropic;
  systemPrompt: string;
  userMessage: string;
  wins: string[];
  completedCount: number;
  daysActive: number;
}): Promise<{ content: WeeklyReportContent; bannedFilteredCount: number }> {
  const { anthropic, systemPrompt, userMessage, wins, completedCount, daysActive } = params;
  let bannedFilteredCount = 0;
  let lastViolation = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const extra = attempt === 1
        ? `\n\nIMPORTANT: A previous draft was rejected because it contained: ${lastViolation}. Rewrite strictly within the rules — no percentages, no streaks, no inferred emotions, no accusations, no sensitive topics, no quoting negative admissions. Output JSON only.`
        : "";
      const message = await anthropic.messages.create({
        model: Notio_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage + extra }],
      });
      const rawText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = WeeklyReportContentSchema.parse(safeParseJson(rawText));
      const rawRendered = renderReportText(parsed);
      const violations = findToneViolations({ rawText: rawRendered, content: parsed });
      if (violations.length === 0) {
        return { content: parsed, bannedFilteredCount };
      }
      bannedFilteredCount += 1;
      lastViolation = violations.join("; ");
      console.warn(`[weekly-report] attempt ${attempt + 1} rejected: ${lastViolation}`);
    } catch (err) {
      console.error(`[weekly-report] attempt ${attempt + 1} error:`, err);
      lastViolation = err instanceof Error ? err.message : "unknown error";
      bannedFilteredCount += 1;
    }
  }

  return { content: safeFallbackContent(wins, completedCount, daysActive), bannedFilteredCount };
}

// ------------------------------------------------------------------
// Core generation (used by cron + manual regenerate)
// ------------------------------------------------------------------

export async function generateWeeklyReportForUser(userId: string, now: Date): Promise<{
  weekStart: string;
  weekEnd: string;
  content: WeeklyReportContent;
  rawText: string;
  bannedFilteredCount: number;
} | null> {
  const ctx = await assembleContext(userId, now);
  // NEW: Always generate a report — even for a fully inactive week. A
  // zero-activity report shows 0/7 days, 0 wins, 0 tasks, and a short
  // motivational nudge instead of an empty silence. This matches the
  // user's request: "if user didn't create a map within a week, show zero
  // all report zero, add some motivational thoughts."
  //
  // For the zero-activity case we skip the LLM call entirely and use the
  // safe fallback — saves tokens and avoids the model inventing content
  // for a week with no data.
  if (ctx.daysActive === 0 && ctx.wins.length === 0 && ctx.completedCount === 0) {
    const content = safeFallbackContent([], 0, 0);
    const rawText = renderReportText(content);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("weekly_reports")
      .upsert(
        {
          user_id: userId,
          week_start: ctx.weekStart,
          week_end: ctx.weekEnd,
          content,
          raw_text: rawText,
          banned_filtered_count: 0,
        },
        { onConflict: "user_id,week_start" },
      );
    if (error) {
      console.error("[weekly-report] upsert (zero-activity) failed:", error.message);
    }
    return { weekStart: ctx.weekStart, weekEnd: ctx.weekEnd, content, rawText, bannedFilteredCount: 0 };
  }

  const anthropic = createAnthropicClient();
  const systemPrompt = buildWeeklyReportSystemPrompt();
  const userMessage = buildWeeklyReportUserMessage({
    wins: ctx.wins,
    completedCount: ctx.completedCount,
    daysActive: ctx.daysActive,
    ragSnippets: ctx.ragSnippets,
    weekStart: ctx.weekStart,
    weekEnd: ctx.weekEnd,
  });

  const { content, bannedFilteredCount } = await generateWithFilter({
    anthropic,
    systemPrompt,
    userMessage,
    wins: ctx.wins,
    completedCount: ctx.completedCount,
    daysActive: ctx.daysActive,
  });

  const rawText = renderReportText(content);

  // Upsert into weekly_reports (1 row per user per week).
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("weekly_reports")
    .upsert(
      {
        user_id: userId,
        week_start: ctx.weekStart,
        week_end: ctx.weekEnd,
        content,
        raw_text: rawText,
        banned_filtered_count: bannedFilteredCount,
      },
      { onConflict: "user_id,week_start" },
    );
  if (error) {
    console.error("[weekly-report] upsert failed:", error.message);
  }

  return { weekStart: ctx.weekStart, weekEnd: ctx.weekEnd, content, rawText, bannedFilteredCount };
}

// ------------------------------------------------------------------
// Server fns for the client
// ------------------------------------------------------------------

export const getLatestReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("weekly_reports")
      .select("id, week_start, week_end, content, raw_text, created_at")
      .eq("user_id", context.userId)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("weekly_reports")
      .select("id, week_start, week_end, content, raw_text, created_at")
      .eq("user_id", context.userId)
      .order("week_start", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Manual regenerate — for testing / "regenerate now" button. Uses the same
// pipeline as the cron job, including EF scoring so a user forcing a fresh
// report also gets an up-to-date "Your week in mind" widget immediately,
// instead of only on their scheduled report day.
export const regenerateMyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await generateWeeklyReportForUser(context.userId, new Date());

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: hours } = await supabaseAdmin
        .from("user_working_hours")
        .select("timezone")
        .eq("user_id", context.userId)
        .maybeSingle();
      const { computeEfForUser } = await import("./ef/compute.server");
      await computeEfForUser(context.userId, (hours as { timezone?: string } | null)?.timezone || "UTC", new Date());
    } catch (efErr) {
      console.error("[regenerateMyReport] EF compute failed:", efErr);
    }

    if (!result) {
      return { generated: false, reason: "No activity this week to report on." };
    }
    return { generated: true, ...result };
  });
