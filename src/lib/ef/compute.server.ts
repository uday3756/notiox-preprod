/**
 * Sunday EF compute. Idempotent: recomputing the same week at the same
 * scoring_version produces the same row (acceptance criterion).
 *
 * Called from the existing weekly-report cron so EF shares the report's cadence
 * and per-user week gating (handoff §8: "same job as the weekly report").
 */
import { getWeekAggregates } from "./aggregate.server";
import { scoreWeek, lowestPillar } from "./score";
import { generatePatterns, generateNudge } from "./patterns.server";
import { SCORING_VERSION, type WeekAggregates } from "./types";
import { mondayOf } from "./week";

const PATTERNS_MIN_WEEKS = 3; // handoff §6: patterns need >= 3 weeks of history

export async function computeEfForUser(
  userId: string,
  tz: string,
  now: Date,
): Promise<{ composite: number; patterns: number } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const weekStart = mondayOf(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekStartDate = weekStart.toISOString().slice(0, 10);

  const agg = await getWeekAggregates(
    userId, weekStart.toISOString(), weekEnd.toISOString(), tz,
  );

  // Prior week's full row — drives the decline cap, the widget delta, and the
  // zero-activity carry-forward below.
  const { data: priorRow } = await supabaseAdmin
    .from("ef_scores").select("*")
    .eq("user_id", userId).lt("week_start", weekStartDate)
    .order("week_start", { ascending: false }).limit(1).maybeSingle();
  const prior = priorRow as {
    composite: number; p_initiation: number | null; p_simplicity: number;
    p_wins: number; p_winddown: number; archetype: string;
  } | null;
  const priorComposite = prior?.composite ?? null;

  // Zero-activity week: never hide the widget (handoff §3: "show the widget with
  // the composite and — for delta... Do not hide the widget"). Two cases:
  //   - Prior history exists: carry last week's score forward UNCHANGED. This is
  //     the literal reading of "a deliberate day off must not lower the score" —
  //     doing nothing this week means the number simply doesn't move.
  //   - True first week ever, no activity: show a genuine 0 with "Getting
  //     Started", matching the handoff's own empty-state instruction.
  if (agg.activeDays === 0) {
    const carried = prior ?? {
      composite: 0, p_initiation: null, p_simplicity: 0, p_wins: 0, p_winddown: 0,
      archetype: "Getting Started",
    };
    const { error: carryErr } = await supabaseAdmin.from("ef_scores").upsert({
      user_id: userId,
      week_start: weekStartDate,
      composite: carried.composite,
      p_initiation: carried.p_initiation,
      p_simplicity: carried.p_simplicity,
      p_wins: carried.p_wins,
      p_winddown: carried.p_winddown,
      archetype: carried.archetype,
      nudge: null, // no new observation this week to base a nudge on
      active_days: 0,
      scoring_version: SCORING_VERSION,
    }, { onConflict: "user_id,week_start" });
    if (carryErr) throw new Error(carryErr.message);
    return { composite: carried.composite, patterns: 0 };
  }

  const { pillars, composite, archetype } = scoreWeek(agg, priorComposite);

  // One nudge per week, driven by the weakest pillar (handoff §5).
  const weakest = lowestPillar(pillars);
  const nudge = weakest ? await generateNudge(weakest, agg) : null;

  const { error: upsertErr } = await supabaseAdmin.from("ef_scores").upsert({
    user_id: userId,
    week_start: weekStartDate,
    composite,
    p_initiation: pillars.initiation,
    p_simplicity: pillars.simplicity,
    p_wins: pillars.wins,
    p_winddown: pillars.winddown,
    archetype,
    nudge,
    active_days: agg.activeDays,
    scoring_version: SCORING_VERSION,
  }, { onConflict: "user_id,week_start" });
  if (upsertErr) throw new Error(upsertErr.message);

  // Handoff §6 — data floor. Before 3 weeks the widget shows an invitation,
  // so we don't spend a model call generating patterns nobody will see.
  const { count } = await supabaseAdmin
    .from("ef_scores").select("week_start", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) < PATTERNS_MIN_WEEKS) return { composite, patterns: 0 };

  // §6a — last 4 rollups by user_id. No similarity search, no transcripts.
  const { data: history } = await supabaseAdmin
    .from("ef_scores").select("active_days, p_simplicity, p_wins, p_winddown")
    .eq("user_id", userId).lt("week_start", weekStartDate)
    .order("week_start", { ascending: false }).limit(4);

  const weeks: WeekAggregates[] = ((history ?? []) as { active_days: number }[]).map((h) => ({
    activeDays: h.active_days,
    daysWithWins: 0, eveningWinDays: 0, mapsCreated: 0,
    avgBranchesPerMap: null, tasksCompleted: 0,
  }));

  const patterns = await generatePatterns({ weeks, current: agg });
  if (!patterns.length) return { composite, patterns: 0 };

  // Replace this week's patterns wholesale so recompute stays idempotent.
  await supabaseAdmin.from("weekly_patterns")
    .delete().eq("user_id", userId).eq("week_start", weekStartDate);
  await supabaseAdmin.from("weekly_patterns").insert(
    patterns.map((p) => ({
      user_id: userId, week_start: weekStartDate, kind: p.kind, body: p.body,
    })),
  );

  return { composite, patterns: patterns.length };
}
