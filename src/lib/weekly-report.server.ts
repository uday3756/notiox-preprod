/**
 * Feature 2 — Weekly Reflection Report: tone filter + prompt builder.
 *
 * The tone rules are NON-NEGOTIABLE per the spec (direct guidance from an
 * ADHD-coach tester). They live in CODE, not just in the prompt — the post-
 * generation filter rejects banned patterns and the caller regenerates.
 *
 * Banned elements:
 *   - Streak counters ("you broke your streak", "X days in a row")
 *   - Completion ratios / percentages framed as grades ("you completed 60%")
 *   - Inferred emotions ("you seemed stressed", "you felt anxious")
 *   - Generic motivational quotes
 *   - Comparisons to other users
 *   - Sensitive-topic keywords (alcohol, drugs, specific health conditions)
 *     even if the user mentioned them
 *   - Second-person accusations ("you skipped", "you failed to", "you didn't")
 *   - Quoting the user's verbatim negative admissions back at them
 *
 * Allowed:
 *   - Cumulative counts ("14 tasks completed") — never as a ratio
 *   - Forward-framed suggestions ("you could look at…")
 *   - Neutral routine category labels (hygiene, study, work, wind-down, errands)
 *   - One open reflection question
 */
import { z } from "zod";

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

export const WeeklyReportContentSchema = z.object({
  // The week's wins, in the user's own words (verbatim from daily_wins — these
  // are positive admissions, so quoting them back is encouraged, not banned).
  // Cap raised from 3 to 50 to match the wins.functions.ts save cap — users
  // can record as many wins as they like (3 is a soft ritual goal, not a hard
  // cap).
  wins: z.array(z.string()).max(50),
  // Cumulative count only — never a ratio or percentage.
  completed_count: z.number().int().min(0),
  // How many of the past 7 days had ANY activity (a win OR a completed task).
  // 0 means the user was completely inactive — the report still generates,
  // with a motivational note instead of an empty silence.
  days_active: z.number().int().min(0).max(7),
  // Shown only when days_active === 0. A short, forward-framed, non-shaming
  // nudge to start small this week. Falls within tone rules (no streaks, no
  // accusations, no inferred emotions).
  motivational_note: z.string().optional(),
  // 2-3 forward-framed focus areas, grouped by neutral routine category.
  focus_areas: z.array(
    z.object({
      category: z.string(),
      suggestion: z.string(),
    }),
  ).min(0).max(3),
  // One open reflection question.
  reflection_question: z.string(),
});

export type WeeklyReportContent = z.infer<typeof WeeklyReportContentSchema>;

// ------------------------------------------------------------------
// Banned-pattern detection
// ------------------------------------------------------------------

// Sensitive topics: even if the user mentioned them, the report must not.
// Matched case-insensitively as whole words (bounded by non-letters).
const SENSITIVE_WORDS = [
  "alcohol", "drink", "drunk", "drinking", "wine", "beer", "liquor",
  "drugs", "drug", "weed", "cocaine", "smoking", "cigarette",
  "depressed", "depression", "anxiety", "anxious", "suicidal", "self-harm",
  "relapse", "addiction", "addict",
];

// Inferred-emotion phrases — the report must never tell the user how they felt.
const INFERRED_EMOTION_PATTERNS = [
  /\byou (?:seem(?:ed)?|appear(?:ed)?|look(?:ed)?|sound(?:ed)?) (?:stressed|anxious|overwhelmed|tired|exhausted|frustrated|angry|sad|down|low|burnt out|burned out)\b/i,
  /\byou (?:were|are|seem|feel|felt) (?:stressed|anxious|overwhelmed|frustrated|exhausted|burnt out|burned out)\b/i,
  /\bfeeling (?:stressed|anxious|overwhelmed|exhausted|burnt out|burned out)\b/i,
];

// Second-person accusation patterns — frame forward, never accuse.
const ACCUSATION_PATTERNS = [
  /\byou (?:didn't|did not|don't|do not|failed to|forgot to|skipped|missed|neglected|avoided|put off|procrastinated)\b/i,
  /\byou (?:never|rarely|seldom|barely)\b/i,
];

// Streak / grade patterns.
const STREAK_PATTERNS = [
  /\b\d+[- ]?day(?:s)? streak\b/i,
  /\bbroke (?:your|a) streak\b/i,
  /\bstreak (?:broken|ended|lost)\b/i,
];
const GRADE_PATTERNS = [
  /\b\d{1,3}\s?%\b/, // any "X%"
  /\b\d{1,3} (?:percent|per cent)\b/i,
  /\bgrade(?:d)? (?:[A-F]|[0-9]{1,2})\b/i,
  /\bcompletion rate\b/i,
  /\b\d+ out of \d+\b/i,
];

// Comparison to other users.
const COMPARISON_PATTERNS = [
  /\bcompared to (?:other|most|the average|everyone|all)\b/i,
  /\bthan (?:other|most|the average|everyone|all) (?:users|people)\b/i,
  /\btop \d+ % of\b/i,
];

// Generic motivational quotes — short, common, in quotation marks.
const QUOTE_PATTERNS = [
  /\b"(?:the only way|success is|believe you|dream it|you miss 100)\b/i,
];

/**
 * Run all banned-pattern checks against a candidate report (both the raw_text
 * and the structured content). Returns a list of violations — empty means
 * the report is safe to deliver.
 */
export function findToneViolations(report: {
  rawText: string;
  content: WeeklyReportContent;
}): string[] {
  const violations: string[] = [];
  const haystack = `${report.rawText}\n${JSON.stringify(report.content)}`;

  // Sensitive words: match as whole words, case-insensitive.
  for (const w of SENSITIVE_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(haystack)) {
      violations.push(`sensitive-topic keyword: "${w}"`);
    }
  }
  for (const re of INFERRED_EMOTION_PATTERNS) {
    if (re.test(haystack)) violations.push(`inferred-emotion pattern: ${re.source}`);
  }
  for (const re of ACCUSATION_PATTERNS) {
    if (re.test(haystack)) violations.push(`accusation pattern: ${re.source}`);
  }
  for (const re of STREAK_PATTERNS) {
    if (re.test(haystack)) violations.push(`streak pattern: ${re.source}`);
  }
  for (const re of GRADE_PATTERNS) {
    if (re.test(haystack)) violations.push(`grade/percentage pattern: ${re.source}`);
  }
  for (const re of COMPARISON_PATTERNS) {
    if (re.test(haystack)) violations.push(`comparison pattern: ${re.source}`);
  }
  for (const re of QUOTE_PATTERNS) {
    if (re.test(haystack)) violations.push(`generic-quote pattern: ${re.source}`);
  }

  // Focus areas cap (2-3).
  if (report.content.focus_areas.length > 3) {
    violations.push(`focus_areas count > 3 (${report.content.focus_areas.length})`);
  }

  return violations;
}

// ------------------------------------------------------------------
// Prompt builder
// ------------------------------------------------------------------

/**
 * Build the system prompt that hard-codes the tone rules. The model gets the
 * rules in the prompt AND the post-generation filter re-checks the output —
 * defense in depth.
 */
export function buildWeeklyReportSystemPrompt(): string {
  return `You write a short weekly reflection report for a person with ADHD.

ABSOLUTE RULES (never break these):
1. NEVER quote the user's negative admissions back at them. If a brain-dump
   mentioned drinking, procrastination, or anything sensitive, that verbatim
   text must NOT appear in the report. Use only the supplied wins (positive
   admissions) verbatim.
2. NEVER name a failure directly. Frame forward as "Suggested focus areas" —
   e.g. "Your evening routine could be a good focus this week" rather than
   "you skipped your hygiene routine 4 times."
3. LEAD with positives: the report opens with the week's wins and the
   completed-task count BEFORE any suggestion appears.
4. BANNED: streak counters, completion ratios or percentages framed as
   grades, inferred emotions ("you seemed stressed"), generic motivational
   quotes, comparisons to other users, ANY language about alcohol, drugs,
   or other sensitive topics even if the user mentioned them.
5. SUGGESTIONS: 2-3 focus areas max, phrased as invitations ("you could
   look at…", "this week might be a good one for…"), grouped by neutral
   routine categories: hygiene routine, study routine, work blocks,
   wind-down routine, errands.
6. Cumulative counts only ("14 tasks completed") — NEVER a ratio or
   percentage of what was planned.
7. End with ONE open reflection question, in the spirit of "mirror, don't
   judge." Not a quiz, not a check on whether they did something.

OUTPUT: valid JSON only, no prose, no markdown fences, with this shape:
{
  "wins": ["win 1", "win 2", "win 3"],
  "completed_count": 14,
  "focus_areas": [
    { "category": "wind-down routine", "suggestion": "Your evening routine could be a good focus this week." }
  ],
  "reflection_question": "What felt different about the days that went well?"
}`;
}

/**
 * Build the user message: the assembled context (wins, completed count,
 * retrieved RAG snippets, compact habit summary). The model sees ONLY this —
 * never the user's raw transcripts or negative admissions.
 */
export function buildWeeklyReportUserMessage(params: {
  wins: string[];
  completedCount: number;
  daysActive: number;
  ragSnippets: string[];
  weekStart: string;
  weekEnd: string;
}): string {
  const winsBlock = params.wins.length
    ? params.wins.map((w, i) => `${i + 1}. ${w}`).join("\n")
    : "(No wins recorded this week.)";

  const ragBlock = params.ragSnippets.length
    ? params.ragSnippets.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "(No recurring themes detected across maps this week.)";

  const activityLine = params.daysActive === 0
    ? "ACTIVE DAYS: 0 out of 7 — the user recorded nothing this week. Set motivational_note to a short, warm, forward-framed nudge (e.g. \"This week is a fresh start — one small win tomorrow counts.\"). Do NOT shame, do NOT mention streaks, do NOT infer emotions."
    : `ACTIVE DAYS: ${params.daysActive} out of 7 — the user showed up on ${params.daysActive} day(s) this week. Acknowledge this gently in the report (no streak counting, no ratios).`;

  return `WEEK: ${params.weekStart} to ${params.weekEnd}

${activityLine}

THIS WEEK'S WINS (in the user's own words — quote these verbatim):
${winsBlock}

COMPLETED TASKS (cumulative count only — do NOT compute a ratio):
${params.completedCount} task(s) completed this week.

RECURRING THEMES ACROSS MAPS (retrieved via similarity search — use these to
spot patterns, but NEVER quote the user's negative admissions back):
${ragBlock}

Write the weekly reflection report following the absolute rules in the system
prompt. Include days_active (0-7) and, if days_active is 0, a short
motivational_note. Output valid JSON only.`;
}

/**
 * Render the structured content as plain text for the in-app card and email.
 * Stays within tone rules — no ratios, no streaks, no accusations.
 */
export function renderReportText(content: WeeklyReportContent): string {
  const lines: string[] = [];

  lines.push("Your week in wins");
  if (content.wins.length === 0) {
    lines.push("No wins recorded this week — that's okay.");
  } else {
    content.wins.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
  }
  lines.push("");

  lines.push("Days active");
  lines.push(`${content.days_active} / 7 day(s) this week.`);
  lines.push("");

  if (content.motivational_note) {
    lines.push("A small nudge");
    lines.push(content.motivational_note);
    lines.push("");
  }

  lines.push("What you got done");
  lines.push(`${content.completed_count} task${content.completed_count === 1 ? "" : "s"} completed.`);
  lines.push("");

  if (content.focus_areas.length > 0) {
    lines.push("Suggested focus areas");
    content.focus_areas.forEach((f) => {
      lines.push(`• ${f.category}: ${f.suggestion}`);
    });
    lines.push("");
  }

  lines.push("One reflection question");
  lines.push(content.reflection_question);

  return lines.join("\n");
}
