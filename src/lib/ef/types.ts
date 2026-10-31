/**
 * Executive Function score — shared types.
 *
 * Handoff (Aug 3, 2026): a glanceable EF score at the top of "Your week in mind",
 * a Pro-only breakdown behind one tap, and a behavioural patterns block.
 *
 * SCORING_VERSION 1 ships THREE pillars. "Task initiation" is deliberately excluded:
 * it is computed from event timestamps, which is exactly what the voice->schedule
 * extraction bug gets wrong, and the handoff is explicit that a wrong EF score is
 * worse than no EF score (§9). It sanctions shipping without that pillar.
 *
 * Stamping the version on every row means the later 4-pillar bump reads as a
 * deliberate algorithm change, not as unexplained score drift.
 */
export const SCORING_VERSION = 1;

export type PillarKey = "initiation" | "simplicity" | "wins" | "winddown";

export const PILLAR_LABELS: Record<PillarKey, string> = {
  initiation: "Task initiation",
  simplicity: "Map simplicity",
  wins: "Daily wins",
  winddown: "Evening wind-down",
};

/**
 * Plain-language definition + the single "what moves this" line.
 * Handoff §4: tapping a pillar row shows exactly this. "That is the floor —
 * nothing goes deeper."
 */
export const PILLAR_COPY: Record<PillarKey, { definition: string; moves: string }> = {
  initiation: {
    definition: "How soon after planning something you actually start it.",
    moves: "Recording a task earlier in the day tends to bring the start forward.",
  },
  simplicity: {
    definition: "How compact your maps are — fewer branches per dump.",
    moves: "Closing a branch before opening the next one.",
  },
  wins: {
    definition: "How consistently you mark something finished on the days you show up.",
    moves: "Marking one small win before you stop for the day.",
  },
  winddown: {
    definition: "Whether the day gets a deliberate close rather than trailing off.",
    moves: "A short wind-down at a similar time each evening.",
  },
};

/** null = not scored at this version (see SCORING_VERSION). */
export type EfPillars = Record<PillarKey, number | null>;

export type EfScoreRow = {
  user_id: string;
  week_start: string;
  composite: number;
  p_initiation: number | null;
  p_simplicity: number;
  p_wins: number;
  p_winddown: number;
  archetype: string;
  nudge: string | null;
  active_days: number;
  scoring_version: number;
};

export type PatternItem = { kind: "working" | "worth_trying"; body: string };

/**
 * Aggregates for one week — the ONLY input to scoring.
 * Aggregates only: no transcripts ever reach the model (handoff §6a).
 */
export type WeekAggregates = {
  /** Days with any activity. Scoring normalises over this, never over 7. */
  activeDays: number;
  daysWithWins: number;
  /** Days with a win recorded after 18:00 in the user's timezone. */
  eveningWinDays: number;
  mapsCreated: number;
  /** null when no maps that week — scored neutral, never punitive. */
  avgBranchesPerMap: number | null;
  tasksCompleted: number;
};
