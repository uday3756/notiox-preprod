/**
 * Content safety for generated patterns. Handoff §6b — "non-negotiable".
 *
 * Both rules are enforced SERVER-SIDE, after generation and before storage —
 * NOT as prompt instructions, because prompt instructions fail silently.
 *
 *   1. Never surface the user's verbatim words.
 *   2. Behavioural topics only (timing, task density, completion, rollover, map
 *      structure). Anything touching substances, mood, medication, physical or
 *      mental health, weight, or relationships is DROPPED, not rephrased.
 *
 * This is the exact failure mode the clinician interviews flagged: an app that
 * reads back a user's admission makes them delete it and never say why.
 */
import type { PatternItem } from "./types";

const BLOCKED_PATTERNS: RegExp[] = [
  // mood / mental health
  /\b(mood|moods|anxious|anxiety|depress\w*|panic|stress\w*|burnout|lonely|loneliness|sad|angry|overwhelm\w*)\b/i,
  /\b(therapy|therapist|counsell?or|psychiatrist|psycholog\w*)\b/i,
  // substances
  /\b(alcohol|drink\w*|drunk|beer|wine|smok\w*|cigarettes?|vap\w*|weed|cannabis|drugs?|caffeine|hangover)\b/i,
  // medication / diagnosis
  /\b(medication|meds|pills?|dose|dosage|prescri\w*|adderall|ritalin|antidepress\w*|diagnos\w*|adhd|symptoms?)\b/i,
  // physical health
  /\b(sick|illness|ill|pain|doctor|clinic|hospital|health)\b/i,
  /\b(sleep|slept|sleeping|insomnia|tired|exhaust\w*|fatigue)\b/i,
  // weight / body / exercise-as-health
  /\b(weight|weigh\w*|calories?|diet|eating|body|fat|gym|workouts?|exercise|exercising)\b/i,
  // relationships
  /\b(girlfriend|boyfriend|partner|spouse|wife|husband|marriage|divorce|breakups?|family|mother|father|mom|dad|kids|children)\b/i,
];

export function isBlockedTopic(text: string): boolean {
  return BLOCKED_PATTERNS.some((re) => re.test(text));
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Rule 1 — never quote the user back to themselves.
 * Flags any shared run of >= minRun words between the generated line and a source.
 */
export function quotesUser(text: string, sources: string[], minRun = 5): boolean {
  const words = norm(text).split(" ").filter(Boolean);
  if (words.length < minRun) return false;
  const haystacks = sources.map(norm);
  if (!haystacks.length) return false;
  for (let i = 0; i + minRun <= words.length; i++) {
    const run = words.slice(i, i + minRun).join(" ");
    if (haystacks.some((h) => h.includes(run))) return true;
  }
  return false;
}

/** Handoff §6: max 2 "Working for you", max 1 "Worth trying". Hard caps. */
const CAPS = { working: 2, worth_trying: 1 } as const;

/**
 * Drop blocked / quoting items, then enforce the 2 + 1 cap.
 *
 * If everything is dropped we return fewer items — the caller renders fewer or the
 * invitation state. We never backfill to hit a count.
 */
export function filterPatterns(items: PatternItem[], sources: string[]): PatternItem[] {
  const kept: PatternItem[] = [];
  const seen: Record<PatternItem["kind"], number> = { working: 0, worth_trying: 0 };

  for (const item of items) {
    const body = item.body.trim();
    if (!body) continue;
    if (isBlockedTopic(body)) continue;
    if (quotesUser(body, sources)) continue;
    if (seen[item.kind] >= CAPS[item.kind]) continue;
    seen[item.kind] += 1;
    kept.push({ kind: item.kind, body });
  }
  return kept;
}
