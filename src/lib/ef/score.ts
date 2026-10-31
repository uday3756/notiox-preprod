/**
 * Deterministic EF scoring. Pure TypeScript, no model involvement.
 *
 * Handoff §8: "Composite and pillars computed in TypeScript. The model never
 * produces a number." The model only writes the nudge/pattern copy.
 */
import type { EfPillars, PillarKey, WeekAggregates } from "./types";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const pct = (num: number, den: number) => (den <= 0 ? 0 : clamp(Math.round((num / den) * 100)));

/** Handoff mock: "Shorter maps — under six branches — close out most reliably." */
const BRANCH_TARGET = 6;
const BRANCH_PENALTY = 12;

export function computePillars(agg: WeekAggregates): EfPillars {
  const simplicity =
    agg.avgBranchesPerMap === null
      ? 50 // no maps this week: neutral, never punitive
      : clamp(100 - Math.max(0, agg.avgBranchesPerMap - BRANCH_TARGET) * BRANCH_PENALTY);

  return {
    // SCORING_VERSION 1 — blocked on the voice->schedule extraction bug (handoff §9).
    initiation: null,
    simplicity: Math.round(simplicity),
    // Handoff §8: normalise over ACTIVE days so a deliberate day off cannot lower
    // the score. "Days active 4/7" is display, never a pillar input.
    wins: pct(agg.daysWithWins, agg.activeDays),
    winddown: pct(agg.eveningWinDays, agg.activeDays),
  };
}

export function computeComposite(p: EfPillars): number {
  const vals = (Object.values(p) as (number | null)[]).filter((v): v is number => v !== null);
  if (!vals.length) return 0;
  return clamp(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
}

/** Handoff §8: week-over-week drop capped at 5 points. Increases are uncapped. */
export function applyDeclineCap(current: number, prior: number | null): number {
  if (prior === null) return current;
  return current < prior - 5 ? prior - 5 : current;
}

/**
 * Handoff §3: archetype is "derived from highest+lowest pillar, not a separate
 * system" — it is the label on the score, never a parallel scoring track.
 */
const ARCHETYPE: Record<string, string> = {
  "wins|simplicity": "Steady Builder",
  "wins|winddown": "Strong Starter",
  "simplicity|wins": "Clear Thinker",
  "simplicity|winddown": "Focused Planner",
  "winddown|wins": "Deliberate Closer",
  "winddown|simplicity": "Evening Finisher",
};

export function deriveArchetype(p: EfPillars): string {
  const entries = (Object.entries(p) as [PillarKey, number | null][])
    .filter((e): e is [PillarKey, number] => e[1] !== null)
    // Tie-break on the pillar key so the archetype is stable for identical input.
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  if (entries.length < 2) return "Getting Started";
  const highest = entries[0][0];
  const lowest = entries[entries.length - 1][0];
  return ARCHETYPE[`${highest}|${lowest}`] ?? "Steady Builder";
}

export function scoreWeek(agg: WeekAggregates, priorComposite: number | null) {
  const pillars = computePillars(agg);
  const composite = applyDeclineCap(computeComposite(pillars), priorComposite);
  return { pillars, composite, archetype: deriveArchetype(pillars) };
}

/** Lowest-scoring pillar — drives the single weekly nudge (handoff §5). */
export function lowestPillar(p: EfPillars): PillarKey | null {
  const entries = (Object.entries(p) as [PillarKey, number | null][])
    .filter((e): e is [PillarKey, number] => e[1] !== null)
    .sort((a, b) => (a[1] - b[1]) || a[0].localeCompare(b[0]));
  return entries.length ? entries[0][0] : null;
}
