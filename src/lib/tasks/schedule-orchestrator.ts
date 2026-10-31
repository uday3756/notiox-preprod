/**
 * Schedule orchestration: normalize → Claude extract → title repair → validate.
 * Chrono is not used — all timed tasks come from Claude.
 */
import {
  collapseAnchoredWeekdayDuplicates,
  isGarbageScheduleTitle,
  normalizeTranscriptForSchedule,
  repairScheduleTitle,
} from "@/lib/tasks/chrono-schedule-fallback";

export type OrchestratedScheduleTask = {
  title: string;
  category: string;
  start_time_iso: string | null;
  end_time_iso: string | null;
  estimated_duration_minutes: number;
  is_timebound: boolean;
  confidence: number;
  interpretation: string;
  requires_confirmation: boolean;
  timezone_assumed: string;
};

export type AiScheduleExtractFn = (
  normalizedTranscript: string,
) => Promise<OrchestratedScheduleTask[]>;

/** Stage 1 — normalize messy voice dumps (STT, self-corrections, spoken clocks). */
export function stageNormalize(transcript: string): string {
  return normalizeTranscriptForSchedule(transcript);
}

/** Stage 3 — canonicalize titles; drop garbage fragments. */
export function stageRepairTitles<T extends OrchestratedScheduleTask>(
  tasks: T[],
  normalizedTranscript: string,
): T[] {
  const out: T[] = [];
  for (const t of tasks) {
    if (!t.start_time_iso) continue;
    const repaired = repairScheduleTitle(t.title, normalizedTranscript);
    if (!repaired || isGarbageScheduleTitle(repaired)) continue;
    out.push({
      ...t,
      title: repaired,
      interpretation: t.interpretation || `Repaired title → ${repaired}`,
    });
  }
  return out;
}

/** Stage 5 — final validation before persist. */
export function stageValidate<T extends OrchestratedScheduleTask>(tasks: T[]): T[] {
  return tasks.filter(
    (t) =>
      Boolean(t.start_time_iso) &&
      t.is_timebound !== false &&
      !isGarbageScheduleTitle(t.title) &&
      t.title.trim().split(/\s+/).length <= 6,
  );
}

/**
 * Full orchestration: normalize → Claude extract → repair → validate.
 */
export async function orchestrateScheduleExtraction(options: {
  transcript: string;
  userTimezone: string;
  currentDateTimeIso: string;
  extractWithAi: AiScheduleExtractFn;
}): Promise<OrchestratedScheduleTask[]> {
  const normalized = stageNormalize(options.transcript);
  const instant = new Date(options.currentDateTimeIso);

  const aiTasks = await options.extractWithAi(normalized);
  const repairedAi = stageRepairTitles(aiTasks, normalized);

  const collapsed = collapseAnchoredWeekdayDuplicates(
    repairedAi,
    normalized,
    options.userTimezone,
    instant,
  );
  const validated = stageValidate(collapsed);

  console.log(
    `[schedule-orchestrator] claude=${repairedAi.length} validated=${validated.length}`,
  );
  return validated;
}
