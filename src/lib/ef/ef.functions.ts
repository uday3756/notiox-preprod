/**
 * EF read path — one round trip for everything the weekly card needs.
 * Degrades to an empty payload if the migration hasn't been applied yet, so the
 * rest of "Your week in mind" keeps rendering.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mondayOf } from "./week";
import type { EfScoreRow, PatternItem } from "./types";

export type EfWeekPayload = {
  score: EfScoreRow | null;
  priorComposite: number | null;
  patterns: PatternItem[];
  /** Composites oldest -> newest, for the sparkline. */
  trend: number[];
  isPro: boolean;
  paywallSeenThisWeek: boolean;
  weeksOfHistory: number;
};

const EMPTY: EfWeekPayload = {
  score: null, priorComposite: null, patterns: [], trend: [],
  isPro: false, paywallSeenThisWeek: false, weeksOfHistory: 0,
};

export const getEfWeek = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EfWeekPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    async function loadHistory() {
      const { data, error } = await supabaseAdmin
        .from("ef_scores").select("*").eq("user_id", uid)
        .order("week_start", { ascending: false }).limit(4);
      return { rows: (data ?? []) as EfScoreRow[], error };
    }

    let { rows: history, error } = await loadHistory();

    // Table missing (migration not applied) — don't break the weekly card.
    if (error) {
      console.warn("[ef] ef_scores unavailable:", error.message);
      return EMPTY;
    }

    // Compute-on-read: the cron only fires on each user's scheduled report day,
    // so a user viewing the page before that day would otherwise see no widget
    // at all. Handoff §3 is explicit — "Do not hide the widget" — so if this
    // week has no row yet, compute it now and re-read. Idempotent (upsert on
    // user_id+week_start), and a zero-activity week costs no AI call.
    const currentWeekStart = mondayOf(new Date()).toISOString().slice(0, 10);
    if (!history.some((h) => h.week_start === currentWeekStart)) {
      try {
        const { data: hours } = await supabaseAdmin
          .from("user_working_hours").select("timezone").eq("user_id", uid).maybeSingle();
        const { computeEfForUser } = await import("./compute.server");
        await computeEfForUser(uid, (hours as { timezone?: string } | null)?.timezone || "UTC", new Date());
        ({ rows: history } = await loadHistory());
      } catch (err) {
        console.error("[ef] compute-on-read failed:", err);
      }
    }

    const score = history[0] ?? null;
    if (!score) return EMPTY;

    const [patsRes, subRes, profRes, countRes] = await Promise.all([
      supabaseAdmin.from("weekly_patterns").select("kind, body")
        .eq("user_id", uid).eq("week_start", score.week_start),
      supabaseAdmin.from("subscriptions").select("plan").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("profiles").select("ef_paywall_shown_at").eq("id", uid).maybeSingle(),
      supabaseAdmin.from("ef_scores").select("week_start", { count: "exact", head: true })
        .eq("user_id", uid),
    ]);

    const isPro = (subRes.data as { plan?: string } | null)?.plan === "pro";

    // Frequency guard (handoff §4): the upgrade sheet shows at most once per week.
    const shownAt = (profRes.data as { ef_paywall_shown_at: string | null } | null)
      ?.ef_paywall_shown_at ?? null;
    const paywallSeenThisWeek = shownAt
      ? new Date(shownAt) >= new Date(`${score.week_start}T00:00:00.000Z`)
      : false;

    return {
      score,
      priorComposite: history[1]?.composite ?? null,
      patterns: (patsRes.data ?? []) as PatternItem[],
      trend: history.slice().reverse().map((h) => h.composite),
      isPro,
      paywallSeenThisWeek,
      weeksOfHistory: countRes.count ?? history.length,
    };
  });

export type EfHistoryPayload = {
  /** Newest first, matching listReports' ordering. Up to 12 (same cap as listReports). */
  scores: EfScoreRow[];
  patternsByWeek: Record<string, PatternItem[]>;
  /** Composites oldest -> newest, for the sparkline (shared by every week's detail sheet —
   *  the handoff never specced a per-historical-week trend, so we reuse the current one). */
  trend: number[];
  isPro: boolean;
  /** Relative to the ACTUAL current week, not any individual historical row — so tapping
   *  five different past weeks in one sitting still only shows the upgrade sheet once. */
  paywallSeenThisWeek: boolean;
  weeksOfHistory: number;
};

const EMPTY_HISTORY: EfHistoryPayload = {
  scores: [], patternsByWeek: {}, trend: [],
  isPro: false, paywallSeenThisWeek: false, weeksOfHistory: 0,
};

/** Feeds the /weekly-report list page — every historical week's EF score + patterns. */
export const getEfHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EfHistoryPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    async function loadScores() {
      const { data, error } = await supabaseAdmin
        .from("ef_scores").select("*").eq("user_id", uid)
        .order("week_start", { ascending: false }).limit(12);
      return { rows: (data ?? []) as EfScoreRow[], error };
    }

    let { rows: scores, error } = await loadScores();

    if (error) {
      console.warn("[ef] ef_scores unavailable:", error.message);
      return EMPTY_HISTORY;
    }

    // Same compute-on-read guarantee as getEfWeek (see note there).
    const currentWeekStart = mondayOf(new Date()).toISOString().slice(0, 10);
    if (!scores.some((s) => s.week_start === currentWeekStart)) {
      try {
        const { data: hours } = await supabaseAdmin
          .from("user_working_hours").select("timezone").eq("user_id", uid).maybeSingle();
        const { computeEfForUser } = await import("./compute.server");
        await computeEfForUser(uid, (hours as { timezone?: string } | null)?.timezone || "UTC", new Date());
        ({ rows: scores } = await loadScores());
      } catch (err) {
        console.error("[ef] compute-on-read failed:", err);
      }
    }

    if (!scores.length) return EMPTY_HISTORY;

    const [patsRes, subRes, profRes, countRes] = await Promise.all([
      supabaseAdmin.from("weekly_patterns").select("week_start, kind, body")
        .eq("user_id", uid).in("week_start", scores.map((s) => s.week_start)),
      supabaseAdmin.from("subscriptions").select("plan").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("profiles").select("ef_paywall_shown_at").eq("id", uid).maybeSingle(),
      supabaseAdmin.from("ef_scores").select("week_start", { count: "exact", head: true })
        .eq("user_id", uid),
    ]);

    const patternsByWeek: Record<string, PatternItem[]> = {};
    for (const row of (patsRes.data ?? []) as { week_start: string; kind: PatternItem["kind"]; body: string }[]) {
      (patternsByWeek[row.week_start] ??= []).push({ kind: row.kind, body: row.body });
    }

    const isPro = (subRes.data as { plan?: string } | null)?.plan === "pro";

    // The once-per-week guard is anchored to the CURRENT week's Monday, not to
    // whichever historical row the tap came from. Reuses currentWeekStart from
    // the compute-on-read block above.
    const shownAt = (profRes.data as { ef_paywall_shown_at: string | null } | null)
      ?.ef_paywall_shown_at ?? null;
    const paywallSeenThisWeek = shownAt
      ? new Date(shownAt) >= new Date(`${currentWeekStart}T00:00:00.000Z`)
      : false;

    return {
      scores,
      patternsByWeek,
      trend: scores.slice(0, 4).slice().reverse().map((s) => s.composite),
      isPro,
      paywallSeenThisWeek,
      weeksOfHistory: countRes.count ?? scores.length,
    };
  });

/** Stamps the paywall view so later taps in the same week bounce back to the widget. */
export const markPaywallShown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ef_paywall_shown_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) console.warn("[ef] markPaywallShown failed:", error.message);
    return { ok: true as const };
  });
