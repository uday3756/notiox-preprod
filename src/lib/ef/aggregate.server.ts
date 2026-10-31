/**
 * Week aggregation — the only input to EF scoring.
 *
 * Reads existing tables only (daily_wins, maps + nodes, scheduling_nodes).
 * Aggregates only: no transcripts leave the database.
 */
import type { WeekAggregates } from "./types";

/** yyyy-mm-dd in the user's timezone, so "days" mean their days. */
function localDayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

function localHour(iso: string, tz: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false })
      .format(new Date(iso)),
  );
}

const EVENING_HOUR = 18;

export async function getWeekAggregates(
  userId: string,
  weekStartIso: string,
  weekEndIso: string,
  tz: string,
): Promise<WeekAggregates> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [winsRes, mapsRes, tasksRes] = await Promise.all([
    supabaseAdmin.from("daily_wins").select("created_at")
      .eq("user_id", userId).gte("created_at", weekStartIso).lt("created_at", weekEndIso),
    supabaseAdmin.from("maps").select("id, created_at")
      .eq("user_id", userId).gte("created_at", weekStartIso).lt("created_at", weekEndIso),
    supabaseAdmin.from("scheduling_nodes").select("status, updated_at")
      .eq("user_id", userId).gte("updated_at", weekStartIso).lt("updated_at", weekEndIso),
  ]);

  const wins = (winsRes.data ?? []) as { created_at: string }[];
  const maps = (mapsRes.data ?? []) as { id: string; created_at: string }[];
  const tasks = (tasksRes.data ?? []) as { status: string; updated_at: string }[];

  const activeDays = new Set<string>();
  const winDays = new Set<string>();
  const eveningDays = new Set<string>();

  for (const w of wins) {
    const day = localDayKey(w.created_at, tz);
    activeDays.add(day);
    winDays.add(day);
    if (localHour(w.created_at, tz) >= EVENING_HOUR) eveningDays.add(day);
  }
  for (const m of maps) activeDays.add(localDayKey(m.created_at, tz));

  const completed = tasks.filter((t) => t.status === "completed");
  for (const t of completed) activeDays.add(localDayKey(t.updated_at, tz));

  // Branch count per map = nodes whose parent is that map's root node.
  let avgBranchesPerMap: number | null = null;
  if (maps.length) {
    const mapIds = maps.map((m) => m.id);
    const [rootsRes, nodesRes] = await Promise.all([
      supabaseAdmin.from("nodes").select("id, map_id").is("parent_id", null).in("map_id", mapIds),
      supabaseAdmin.from("nodes").select("map_id, parent_id").in("map_id", mapIds),
    ]);

    const rootIdByMap = new Map<string, string>();
    for (const r of (rootsRes.data ?? []) as { id: string; map_id: string }[]) {
      rootIdByMap.set(r.map_id, r.id);
    }

    const branchCount = new Map<string, number>();
    for (const n of (nodesRes.data ?? []) as { map_id: string; parent_id: string | null }[]) {
      if (n.parent_id && rootIdByMap.get(n.map_id) === n.parent_id) {
        branchCount.set(n.map_id, (branchCount.get(n.map_id) ?? 0) + 1);
      }
    }

    const counts = mapIds.map((id) => branchCount.get(id) ?? 0);
    avgBranchesPerMap = counts.reduce((a, b) => a + b, 0) / counts.length;
  }

  return {
    activeDays: activeDays.size,
    daysWithWins: winDays.size,
    eveningWinDays: eveningDays.size,
    mapsCreated: maps.length,
    avgBranchesPerMap,
    tasksCompleted: completed.length,
  };
}
