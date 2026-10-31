import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface AdaptiveInsights {
  completionRate: number;
  estimationAccuracy: number;
  bestHours: number[];
  worstHours: number[];
  categoryAccuracy: Record<string, number>;
  paddingRecommendations: { category: string; multiplier: number }[];
  energyLevel: "high" | "medium" | "low";
  recommendedBreaks: { time: string; reason: string }[];
  totalCompleted: number;
}

// ─────────────────────────────────────────────────────────────────
// MAIN: Compute adaptive insights from completed tasks
// ─────────────────────────────────────────────────────────────────

export const computeAdaptiveInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Fetch completed tasks (last 90 days)
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const { data: completed } = await supabase
      .from("scheduling_nodes")
      .select(
        "category, estimated_duration_minutes, actual_duration_minutes, completed_at, start_time, status"
      )
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", since.toISOString());

    const { data: allTasks } = await supabase
      .from("scheduling_nodes")
      .select("status")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());

    const tasks = completed || [];
    const total = allTasks?.length || 0;
    const completedCount = tasks.length;

    // ── Completion rate ──
    const completionRate = total > 0 ? (completedCount / total) * 100 : 0;

    // ── Estimation accuracy (actual / estimated) ──
    const withEstimates = tasks.filter(
      (t) => t.estimated_duration_minutes && t.actual_duration_minutes
    );
    const ratios = withEstimates.map(
      (t) => t.actual_duration_minutes! / t.estimated_duration_minutes!
    );
    const avgRatio =
      ratios.length > 0
        ? ratios.reduce((a, b) => a + b, 0) / ratios.length
        : 1.0;

    // ── Category accuracy ──
    const byCategory: Record<string, number[]> = {};
    withEstimates.forEach((t) => {
      if (!byCategory[t.category]) byCategory[t.category] = [];
      byCategory[t.category].push(
        t.actual_duration_minutes! / t.estimated_duration_minutes!
      );
    });
    const categoryAccuracy: Record<string, number> = {};
    Object.entries(byCategory).forEach(([cat, rs]) => {
      categoryAccuracy[cat] = rs.reduce((a, b) => a + b, 0) / rs.length;
    });

    // ── Padding recommendations ──
    const paddingRecommendations = Object.entries(categoryAccuracy)
      .filter(([, ratio]) => ratio > 1.15)
      .map(([category, ratio]) => ({
        category,
        multiplier: ratio > 1.5 ? 1.5 : ratio > 1.3 ? 1.3 : 1.15,
      }));

    // ── Hour-level productivity ──
    const hourScores: Record<number, { sum: number; count: number }> = {};
    tasks.forEach((t) => {
      if (!t.completed_at) return;
      const hour = new Date(t.completed_at).getHours();
      if (!hourScores[hour]) hourScores[hour] = { sum: 0, count: 0 };

      // Score: on-time = 1.0, slightly over = 0.6, way over = 0.3
      let score = 1.0;
      if (t.estimated_duration_minutes && t.actual_duration_minutes) {
        const r = t.actual_duration_minutes / t.estimated_duration_minutes;
        score = r <= 1.0 ? 1.0 : r <= 1.5 ? 0.6 : 0.3;
      }
      hourScores[hour].sum += score;
      hourScores[hour].count += 1;
    });

    const hourAvg = Object.entries(hourScores)
      .filter(([, v]) => v.count >= 2) // need at least 2 samples
      .map(([hour, v]) => ({
        hour: parseInt(hour),
        score: v.sum / v.count,
      }))
      .sort((a, b) => b.score - a.score);

    const bestHours = hourAvg.slice(0, 3).map((h) => h.hour);
    const worstHours = hourAvg.slice(-3).map((h) => h.hour).reverse();

    // ── Energy level (based on recent estimation drift) ──
    const recentRatio =
      ratios.slice(-10).reduce((a, b) => a + b, 0) /
      Math.max(1, ratios.slice(-10).length);
    const energyLevel: "high" | "medium" | "low" =
      recentRatio <= 1.1 ? "high" : recentRatio <= 1.4 ? "medium" : "low";

    // ── Recommended breaks ──
    const recommendedBreaks: { time: string; reason: string }[] = [];
    if (energyLevel === "low") {
      recommendedBreaks.push({
        time: "Now",
        reason: "You're running over on tasks — a short break may help reset focus",
      });
    }
    worstHours.slice(0, 1).forEach((hour) => {
      recommendedBreaks.push({
        time: `${hour}:00`,
        reason: `Productivity dips around this hour — consider a break or lighter tasks`,
      });
    });

    // ── Persist aggregate to adaptive_patterns ──
    await supabase.from("adaptive_patterns").upsert(
      {
        user_id: userId,
        total_tasks_completed: completedCount,
        completion_rate: Math.round(completionRate * 100) / 100,
        estimation_accuracy_ratio: Math.round(avgRatio * 100) / 100,
        category_accuracy: categoryAccuracy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    const insights: AdaptiveInsights = {
      completionRate: Math.round(completionRate * 10) / 10,
      estimationAccuracy: Math.round(avgRatio * 100) / 100,
      bestHours,
      worstHours,
      categoryAccuracy,
      paddingRecommendations,
      energyLevel,
      recommendedBreaks,
      totalCompleted: completedCount,
    };

    return insights;
  });

// ─────────────────────────────────────────────────────────────────
// Apply padding when scheduling a new task
// ─────────────────────────────────────────────────────────────────

export const getPaddedDuration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        category: z.string(),
        baseDurationMinutes: z.number().positive(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: patterns } = await supabase
      .from("adaptive_patterns")
      .select("category_accuracy")
      .eq("user_id", userId)
      .single();

    const accuracy =
      (patterns?.category_accuracy as Record<string, number>)?.[
        data.category
      ] ?? 1.0;

    let multiplier = 1.0;
    if (accuracy > 1.5) multiplier = 1.5;
    else if (accuracy > 1.3) multiplier = 1.3;
    else if (accuracy > 1.15) multiplier = 1.15;

    const paddedDuration = Math.round(data.baseDurationMinutes * multiplier);

    return {
      originalDuration: data.baseDurationMinutes,
      paddedDuration,
      multiplier,
      reason:
        multiplier > 1
          ? `You historically take ${Math.round((accuracy - 1) * 100)}% longer on ${data.category} tasks`
          : "Your estimates for this category are accurate",
    };
  });

// ─────────────────────────────────────────────────────────────────
// Record actual duration on task completion
// ─────────────────────────────────────────────────────────────────

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        actualDurationMinutes: z.number().positive().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: task } = await supabase
      .from("scheduling_nodes")
      .select("id, revision")
      .eq("id", data.taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (task) {
      try {
        const { commitTaskCompletion } = await import("./task-completion.server");
        const { randomUUID } = await import("node:crypto");
        await commitTaskCompletion(
          userId,
          {
            entityId: task.id,
            expectedRevision: typeof task.revision === "number" ? task.revision : 0,
            desiredState: true,
            actionId: randomUUID(),
            source: "plan",
          },
          supabase as never,
        );
        if (data.actualDurationMinutes) {
          await supabase
            .from("scheduling_nodes")
            .update({ actual_duration_minutes: data.actualDurationMinutes })
            .eq("id", data.taskId)
            .eq("user_id", userId);
        }
        await supabase.from("scheduling_logs").insert({
          user_id: userId,
          node_id: data.taskId,
          action: "completed",
          source: "manual_input",
        });
        return { ok: true };
      } catch {
        /* fall through to legacy update */
      }
    }

    const updates: Record<string, unknown> = {
      status: "completed",
      completed_at: new Date().toISOString(),
    };
    if (data.actualDurationMinutes) {
      updates.actual_duration_minutes = data.actualDurationMinutes;
    }

    const { error } = await supabase
      .from("scheduling_nodes")
      .update(updates)
      .eq("id", data.taskId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    // Log it
    await supabase.from("scheduling_logs").insert({
      user_id: userId,
      node_id: data.taskId,
      action: "completed",
      source: "manual_input",
    });

    return { ok: true };
  });
