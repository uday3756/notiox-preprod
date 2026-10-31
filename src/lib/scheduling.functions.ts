import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAnthropicClient, Notio_MODEL } from "@/lib/anthropic.server";
import Anthropic from "@anthropic-ai/sdk";
import {
  addMinutes,
  addDays,
  set,
  format,
  parse,
  isAfter,
  isBefore,
  getHours,
  startOfDay,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  formatNowInTimezone,
  normalizeNaiveLocalToUtc,
} from "@/lib/zoned-datetime";

// --------------------------------------------------------------------------
// TYPES & SCHEMAS
// --------------------------------------------------------------------------

const VALID_CATEGORIES = [
  "meeting",
  "deadline",
  "standup",
  "presentation",
  "deep-work",
  "break",
  "lunch",
  "admin",
  "planning",
  "exercise",
  "personal",
  "task",
] as const;

export const TimeExtractionResultSchema = z.object({
  title: z.string(),
  // Tolerate any category string from the model; coerce unknown ones to "task".
  category: z
    .string()
    .transform((c) =>
      (VALID_CATEGORIES as readonly string[]).includes(c) ? c : "task"
    ),
  start_time_iso: z.string().nullable(),
  end_time_iso: z.string().nullable(),
  estimated_duration_minutes: z.number().int().positive().catch(30),
  is_timebound: z.boolean(),
  confidence: z.number().min(0).max(1).catch(0.7),
  interpretation: z.string(),
  requires_confirmation: z.boolean().catch(false),
  // Accept fallback_times as array of strings OR objects OR missing.
  fallback_times: z
    .array(
      z.union([
        z.string().transform((time) => ({ time, reason: "Alternative time" })),
        z.object({ time: z.string(), reason: z.string().optional().default("Alternative time") }),
      ])
    )
    .optional()
    .catch(undefined),
  timezone_assumed: z.string().catch("UTC"),
});

export type TimeExtractionResult = z.infer<typeof TimeExtractionResultSchema>;

const ExtractScheduleInput = z.object({
  // Map transcripts can be long stream-of-thought dumps. Cap generously (matches
  // the map-structuring limit) and trim on the client so big inputs don't get
  // rejected with a "too_big" error before extraction even runs.
  transcript: z.string().min(2).max(12000),
  userTimezone: z.string().default("UTC"),
  // Accept both plain UTC ("...Z") and offset ("...+00:00") ISO strings, since
  // Supabase timestamps carry an offset.
  currentDateTime: z.string().datetime({ offset: true }),
  // Canonical task names (the map's to-do list). When provided, each scheduled
  // task is titled with the matching name so the schedule mirrors the to-do list.
  taskTitles: z.array(z.string()).optional(),
});

// --------------------------------------------------------------------------
// COST CONTROLS (tunable via env, no redeploy required)
// --------------------------------------------------------------------------
// AI_EFFORT: reasoning effort when thinking IS used (low | medium | high).
//   "low" keeps reasoning cheap while still handling implicit/chained input.
// THINKING_MIN_CHARS: transcripts shorter than this skip thinking entirely.
const AI_EFFORT = process.env.AI_EFFORT?.trim() || "low";
const THINKING_MIN_CHARS = Number(process.env.THINKING_MIN_CHARS ?? "220") || 220;

// Sequence/chaining cues that signal the transcript needs real reasoning.
const NEEDS_THINKING_RE =
  /\b(after that|before that|after coming|once (?:i|we)|as soon as|then|till|until|from\s+\d{1,2}[^,.]{0,8}\bto\b)\b/i;

/** True when a transcript is complex enough to justify reasoning tokens. Simple
 *  one-liners ("lunch at 1pm") skip thinking to save ~60% of the cost. */
function scheduleNeedsThinking(transcript: string): boolean {
  const t = (transcript || "").trim();
  if (t.length >= THINKING_MIN_CHARS) return true;
  if (NEEDS_THINKING_RE.test(t)) return true;
  const clockHits =
    t.match(/\b\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi) || [];
  return clockHits.length >= 4; // 4+ time mentions ⇒ multi-activity day
}

/** Complexity-gated reasoning params: simple inputs run thinking-off (cheapest);
 *  complex inputs think adaptively but capped at AI_EFFORT. Spread into create(). */
function reasoningParams(transcript: string): Record<string, unknown> {
  if (!scheduleNeedsThinking(transcript)) {
    return { thinking: { type: "disabled" } };
  }
  return {
    thinking: { type: "adaptive" },
    output_config: { effort: AI_EFFORT },
  };
}

// --------------------------------------------------------------------------
// CLAUDE PROMPT FOR TIMESTAMP EXTRACTION
// --------------------------------------------------------------------------

// Stable, cacheable rules for single-task extraction (no per-request data).
const SINGLE_SCHEDULE_RULES = `You extract scheduling info from a user's spoken thought.

The user message provides CURRENT DATE/TIME, USER TIMEZONE, and the transcript.
CLOCK STYLE: USA / Australia / New Zealand / Canada / Philippines accounts commonly
use AM/PM; other regions often use 24-hour clocks. Always honor explicit AM/PM or
24-hour times the user says.

RULES:
1. Resolve relative phrases ("today", "tomorrow", "tonight", "Friday", "next week",
   "in 2 hours", "this afternoon") against CURRENT DATE/TIME in USER TIMEZONE.
2. Default times for fuzzy phrases:
   - "morning" = 09:00, "afternoon" = 14:00, "evening" = 18:00, "night" = 20:00
3. ALWAYS return start_time_iso and end_time_iso as ISO 8601 in NAIVE form (no offset, no Z).
   Return the literal clock times from the user's timezone without any timezone marker.
   Example: if user says "2 PM" in America/New_York, return "2026-06-24T14:00:00" (NOT T14:00:00-04:00 or Z).
4. Adjust confidence: 0.95+ for explicit times, 0.80-0.90 for inferred relative times.
5. Set is_timebound=true if ANY time hint exists (day + optional time).
6. Categories: meeting, deadline, standup, presentation, deep-work, break, lunch, admin, planning, exercise, personal, task.

EXAMPLES:
- "Meeting tomorrow at 2 PM" -> is_timebound: true, start_time: "2026-06-25T14:00:00", confidence: 0.95
- "Review Friday" -> is_timebound: true, start_time: "2026-06-27T09:00:00", confidence: 0.85
- "Lunch at noon" -> is_timebound: true, start_time: "2026-06-24T12:00:00", confidence: 0.90
- "Review the project" -> is_timebound: false, start_time: null, confidence: 0.2

RETURN VALID JSON ONLY:
{
  "title": "Q3 Planning Session",
  "category": "meeting",
  "start_time_iso": "2026-06-24T14:00:00",
  "end_time_iso": "2026-06-24T15:00:00",
  "estimated_duration_minutes": 60,
  "is_timebound": true,
  "confidence": 0.95,
  "interpretation": "Meeting tomorrow at 2 PM for 1 hour",
  "requires_confirmation": false,
  "fallback_times": [],
  "timezone_assumed": "America/New_York"
}`;

// Stable, cacheable rules for multi-task extraction. Contains NO per-request
// data (date, timezone, to-do titles, transcript) so the exact same bytes are
// sent on every call — prompt caching then bills this prefix at ~10% after the
// first request. Per-request context goes in the user message (buildScheduleContext).
const MULTI_SCHEDULE_RULES = `You are stage Extract only in a scheduling pipeline. Output atomic timed tasks as JSON. Do not narrate.

The user message provides CURRENT DATE/TIME, USER TIMEZONE, an optional CANONICAL TITLES list, and the transcript.
CLOCK STYLE: USA / Australia / NZ / Canada / Philippines often use AM/PM; other regions often use 24h or dotted times ("1.30"). Honor explicit AM/PM.

CANONICAL TITLES: if the user message includes a CANONICAL TITLES list, set each timed task's "title" to the SINGLE
best-matching name from that list, copied VERBATIM (same words, same casing). This OVERRIDES the 1–4 word TITLE
CONTRACT below. Match by meaning (e.g. transcript "gym at 9" → the list's "Evening Gym Session"). Only if a timed
activity has no reasonable match may you write your own short title. Do not invent items that aren't timed.

ATOMIC SPLIT: Every distinct activity + clock (or clear daypart) is its OWN task.
Example shape (synthetic): "this coming Tuesday pilates at 9am for 2 hours after that 1.30 class then running 6pm"
→ Pilates 09:00–11:00, Class 13:30, Running 18:00 — three tasks, NOT one blob title.

SEQUENTIAL CHAINING (critical — do not drop work/office/study blocks):
"after that", "then", "till/until <time>", "from <a> to <b>" chain activities back-to-back.
A block given only an END ("office till 2.30", "work till 8", "study until 10") STARTS when
the PREVIOUS activity ends — compute that start yourself and always emit start_time_iso.
NEVER omit an activity just because its start time was implied rather than spoken; a long
work/office/study block is a real task and must appear with BOTH a start and an end.
Example (synthetic): "running 6am, get ready for office 10.30, office till 2.30, half hour
for lunch, after that work till 8, then gym 9 to 11, dinner before gym"
→ Running 06:00–06:30, Office 10:30–14:30, Lunch 14:30–15:00, Work 15:00–20:00,
  Dinner 20:00–21:00, Gym 21:00–23:00 — every block emitted, none dropped.

RULES:
1. Resolve relative days against CURRENT DATE/TIME in USER TIMEZONE.
   - "this Monday" = "coming Monday" = "upcoming Monday" = "this coming Monday"
     = that weekday this week (or today if today is that weekday). ONE task, not today + Monday.
   - Self-corrections ALWAYS win ("tomorrow sorry day after tomorrow" → day after tomorrow only)
   - "Sunday after this one" / "Sunday after next" → that weekend day, not today
2. Explicit clocks are sacred. Accept "9:00 a.m.", "1.30", "6:00 p.m.", "half past 4", "1530 hrs".
   "for 2 hours" / "lasting ninety minutes" sets end_time_iso and estimated_duration_minutes.
   "till 8" / "until 10" / "from 9 to 11" set end_time_iso; if no start clock is spoken, the
   start is the previous activity's end (see SEQUENTIAL CHAINING).
3. Meal/daypart defaults when no clock: breakfast~08:00, lunch~12:30, snack~16:00, dinner~20:00,
   morning~09:00, afternoon~15:00, evening~19:00, night~21:00, appointment/vet~10:00.
4. Return start_time_iso / end_time_iso as NAIVE local ISO (no Z, no offset), e.g. "2026-07-27T09:00:00".
5. TITLE CONTRACT (critical):
   - 1–4 words only: Coaching, Fitting, Class, Running, Interview, Lunch, Dinner, Walk, Dentist…
   - NEVER paste transcript fragments ("Coaching that", "This Monday plan fitting coaching 2 hours")
   - NEVER end a title with filler: that / this / for / with / and
6. Typo tolerance: treat duffer→after, meetiing→meeting, diffrent→different before extracting.
7. Skip / ignore / already-did / cancelled activities are omitted; swaps keep the replacement only.
8. Categories: meeting, deadline, standup, presentation, deep-work, break, lunch, admin,
   planning, exercise, personal, task.
9. Default duration 30m (60 for meetings/meals/appointments) unless a duration phrase exists.
10. Bare evening exercise hours (running/gym/walk at 6) without am/pm → PM.

RETURN VALID JSON ONLY:
{
  "tasks": [
    {
      "title": "Coaching",
      "category": "meeting",
      "start_time_iso": "2026-07-27T09:00:00",
      "end_time_iso": "2026-07-27T11:00:00",
      "estimated_duration_minutes": 120,
      "is_timebound": true,
      "confidence": 0.95,
      "interpretation": "Monday morning coaching 9am for 2 hours",
      "requires_confirmation": false,
      "timezone_assumed": "America/New_York"
    }
  ]
}`;

/** Per-request context for the user message (kept OUT of the cached system
 *  prompt so the cache prefix stays byte-identical across requests). */
function buildScheduleContext(
  currentDateTime: string,
  userTimezone: string,
  taskTitles: string[] = []
): string {
  const titles =
    taskTitles.length > 0
      ? `CANONICAL TITLES (the user's to-do list — use these exact names):\n${taskTitles
          .map((t) => `- ${t}`)
          .join("\n")}\n`
      : "";
  return `CURRENT DATE/TIME: ${currentDateTime}\nUSER TIMEZONE: ${userTimezone}\n${titles}`;
}

/** Pull the first balanced `{...}` JSON object from model text. */
function extractJsonObject(rawText: string): string {
  const text = rawText.trim();
  let jsonStr = "";
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escapeNext) {
      jsonStr += char;
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      jsonStr += char;
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      jsonStr += char;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        braceCount++;
        jsonStr += char;
      } else if (char === "}") {
        jsonStr += char;
        braceCount--;
        if (braceCount === 0) break;
      } else if (braceCount > 0) jsonStr += char;
    } else jsonStr += char;
  }
  if (!jsonStr || braceCount !== 0) {
    throw new Error("Could not extract valid JSON");
  }
  return jsonStr;
}

// --------------------------------------------------------------------------
// TIMEZONE NORMALIZATION & CONVERSION
// --------------------------------------------------------------------------

/** @deprecated Prefer normalizeNaiveLocalToUtc — kept as thin alias for local call sites. */
function normalizeAndConvertToUTC(
  isoString: string | null,
  userTimezone: string
): string | null {
  return normalizeNaiveLocalToUtc(isoString, userTimezone);
}

// --------------------------------------------------------------------------
// DEFAULT DURATIONS & FALLBACK LOGIC
// --------------------------------------------------------------------------

const DEFAULT_DURATIONS: Record<string, number> = {
  meeting: 60,
  deadline: 480, // flexible, end-of-day
  standup: 15,
  presentation: 120,
  "deep-work": 90,
  break: 20,
  lunch: 60,
  admin: 30,
  planning: 45,
  exercise: 30,
  personal: 30,
  task: 30,
};

// --------------------------------------------------------------------------
// SERVER FUNCTION: Extract schedule from transcript
// --------------------------------------------------------------------------

export const extractSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ExtractScheduleInput.parse(input))
  .handler(async ({ data, context }) => {
    const anthropic = createAnthropicClient();

    // Get current date in user's timezone for relative time resolution
    const userNow = toZonedTime(
      new Date(data.currentDateTime),
      data.userTimezone
    );

    let extracted: TimeExtractionResult;
    try {
      console.log("[extractSchedule] Calling Anthropic for transcript:", data.transcript.substring(0, 50));

      // Wall-clock + real offset in the user's IANA zone (not server/UTC offset).
      const contextHeader = buildScheduleContext(
        formatNowInTimezone(data.currentDateTime, data.userTimezone),
        data.userTimezone
      );

      const message = await anthropic.messages.create({
        model: Notio_MODEL,
        max_tokens: 8000,
        // Cost controls: cache the stable rules prefix, and gate thinking by
        // transcript complexity (simple inputs skip reasoning tokens).
        ...reasoningParams(data.transcript),
        system: [
          {
            type: "text",
            text: SINGLE_SCHEDULE_RULES,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `${contextHeader}\nTranscript: "${data.transcript}"

Extract scheduling data and respond with valid JSON only.`,
          },
        ],
      });

      const rawText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      console.log("[extractSchedule] AI response:", rawText.substring(0, 300));

      // Extract JSON by finding matching braces (not by markdown fences, which can appear in the JSON itself)
      let text = rawText.trim();
      let jsonStr = "";
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (escapeNext) {
          jsonStr += char;
          escapeNext = false;
          continue;
        }

        if (char === "\\") {
          jsonStr += char;
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          jsonStr += char;
          continue;
        }

        if (!inString) {
          if (char === "{") {
            braceCount++;
            jsonStr += char;
          } else if (char === "}") {
            jsonStr += char;
            braceCount--;
            if (braceCount === 0) {
              // Found complete JSON object
              break;
            }
          } else if (braceCount > 0) {
            jsonStr += char;
          }
        } else {
          jsonStr += char;
        }
      }

      if (!jsonStr || braceCount !== 0) {
        throw new Error(`Could not extract valid JSON from response: ${rawText.substring(0, 100)}...`);
      }

      // Parse JSON response
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (jsonErr) {
        console.error("[extractSchedule] JSON parse error. Raw:", rawText);
        throw new Error(
          `AI response was not valid JSON: ${jsonStr.substring(0, 100)}...`
        );
      }

      extracted = TimeExtractionResultSchema.parse(parsed);
      console.log("[extractSchedule] Parsed successfully:", extracted.title);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("[extractSchedule] AI error:", errMsg);
      // Return a default non-timebound task instead of throwing
      extracted = {
        title: data.transcript.split(' ').slice(0, 5).join(' '),
        category: "task",
        start_time_iso: null,
        end_time_iso: null,
        estimated_duration_minutes: 30,
        is_timebound: false,
        confidence: 0.3,
        interpretation: "Could not extract a specific time. Try adding a time like '2 PM' or 'tomorrow at 10 AM'.",
        requires_confirmation: true,
        timezone_assumed: data.userTimezone,
      };
    }

    // Normalize and convert times to UTC using the user's saved timezone
    // (unless it's a fallback/error case with no original time)
    if (extracted.start_time_iso) {
      extracted.start_time_iso = normalizeAndConvertToUTC(
        extracted.start_time_iso,
        data.userTimezone
      );
    }
    if (extracted.end_time_iso) {
      extracted.end_time_iso = normalizeAndConvertToUTC(
        extracted.end_time_iso,
        data.userTimezone
      );
    }

    // If times still not extracted after normalization, apply fallback logic
    if (!extracted.start_time_iso && extracted.is_timebound) {
      const fallback = applyFallbackStrategy(
        extracted,
        userNow,
        data.userTimezone
      );
      extracted = fallback;
    }

    return extracted;
  });

// --------------------------------------------------------------------------
// SERVER FUNCTION: Extract MULTIPLE schedules from one transcript
// --------------------------------------------------------------------------

const MultiTaskSchema = z.object({
  tasks: z.array(TimeExtractionResultSchema).catch([]),
});

export const extractMultipleSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ExtractScheduleInput.parse(input))
  .handler(async ({ data }) => {
    const contextHeader = buildScheduleContext(
      formatNowInTimezone(data.currentDateTime, data.userTimezone),
      data.userTimezone,
      data.taskTitles ?? [],
    );

    const { orchestrateScheduleExtraction } = await import(
      "@/lib/tasks/schedule-orchestrator"
    );

    const parseAiTasks = (rawText: string): TimeExtractionResult[] => {
      const parsed = JSON.parse(extractJsonObject(rawText));
      const result = MultiTaskSchema.parse(parsed);
      return result.tasks
        .filter((t) => t.is_timebound && t.start_time_iso)
        .map((t) => ({
          ...t,
          start_time_iso: normalizeAndConvertToUTC(t.start_time_iso, data.userTimezone),
          end_time_iso: t.end_time_iso
            ? normalizeAndConvertToUTC(t.end_time_iso, data.userTimezone)
            : null,
        }))
        .filter((t) => t.start_time_iso) as TimeExtractionResult[];
    };

    const extractWithAi = async (normalizedTranscript: string) => {
      const userContent = `${contextHeader}\nTranscript: "${normalizedTranscript}"

Extract ALL time-bound tasks as atomic items. Respond with valid JSON only.`;

      const anthropic = createAnthropicClient();
      const message = await anthropic.messages.create({
        model: Notio_MODEL,
        max_tokens: 16000,
        // Cost controls: (1) cache the stable rules prefix so it bills at ~10%
        // after the first call; (2) gate thinking by transcript complexity so
        // simple inputs spend no reasoning tokens (reasoningParams). Together
        // these cut a typical extraction ~60% with no accuracy loss on complex
        // inputs (which still get adaptive thinking, capped at AI_EFFORT).
        ...reasoningParams(normalizedTranscript),
        system: [
          {
            type: "text",
            text: MULTI_SCHEDULE_RULES,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      });
      const rawText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const tasks = parseAiTasks(rawText);
      console.log(`[extractMultipleSchedules] Claude extracted ${tasks.length} tasks`);
      return tasks;
    };

    const merged = await orchestrateScheduleExtraction({
      transcript: data.transcript,
      userTimezone: data.userTimezone,
      currentDateTimeIso: data.currentDateTime,
      extractWithAi,
    });
    return merged as TimeExtractionResult[];
  });

// --------------------------------------------------------------------------
// SERVER FUNCTION: Send a test reminder email to the logged-in user
// --------------------------------------------------------------------------

export const sendTestReminderEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Look up the user's email via the admin client
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId
    );

    if (userErr || !userData?.user?.email) {
      return { success: false, error: "Could not find your account email." };
    }

    const email = userData.user.email;
    const { sendTaskReminderEmail } = await import("@/lib/email.server");
    const result = await sendTaskReminderEmail(
      email,
      "Test Reminder - your Notio email reminders work!",
      new Date(Date.now() + 30 * 60000),
      "task"
    );

    if (result.success) {
      return { success: true, email };
    }
    const errMsg =
      typeof result.error === "string"
        ? result.error
        : (result.error as any)?.message || JSON.stringify(result.error);
    return { success: false, error: errMsg, email };
  });

// --------------------------------------------------------------------------
// FALLBACK STRATEGY FOR AMBIGUOUS INPUT
// --------------------------------------------------------------------------

function applyFallbackStrategy(
  result: TimeExtractionResult,
  userNow: Date,
  timezone: string
): TimeExtractionResult {
  if (result.start_time_iso) {
    return result; // Already has explicit time
  }

  // Default: schedule for tomorrow 9 AM
  const tomorrow = addDays(userNow, 1);
  const startTime = set(tomorrow, { hours: 9, minutes: 0, seconds: 0 });

  // Convert local time to UTC
  const startTimeUTC = fromZonedTime(startTime, timezone);
  const duration = result.estimated_duration_minutes;
  const endTimeUTC = addMinutes(startTimeUTC, duration);

  result.start_time_iso = startTimeUTC.toISOString();
  result.end_time_iso = endTimeUTC.toISOString();
  result.confidence = Math.max(0.5, result.confidence - 0.15); // Lower confidence due to fallback
  result.requires_confirmation = true;
  result.interpretation += ` [Fallback: no explicit time given, defaulting to tomorrow 9 AM]`;

  return result;
}

// --------------------------------------------------------------------------
// VALIDATION: Check against working hours
// --------------------------------------------------------------------------

export interface ScheduleConstraint {
  status: "valid" | "conflict" | "outside_hours";
  violations: string[];
  suggestions: {
    earliest_valid_slot?: string; // ISO 8601
    alternative_dates?: string[]; // ISO 8601 array
  };
}

export const validateScheduleAgainstWorkingHours = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator(
    (input: unknown) =>
      z
        .object({
          startTimeISO: z.string().datetime(),
          endTimeISO: z.string().datetime(),
          category: z.string(),
          estimatedDurationMinutes: z.number().positive(),
          ignoreTaskId: z.string().uuid().optional(),
        })
        .parse(input)
  )
  .handler(async ({ data, context }) => {
    // Fetch user's working hours
    const { data: workingHours, error: whErr } = await context.supabase
      .from("user_working_hours")
      .select("*")
      .eq("user_id", context.userId)
      .single();

    if (whErr || !workingHours) {
      // No working hours set, allow anything
      return {
        status: "valid" as const,
        violations: [],
        suggestions: {},
      };
    }

    const violations: string[] = [];
    const startTime = new Date(data.startTimeISO);
    const endTime = new Date(data.endTimeISO);
    const timezone = workingHours.timezone || "UTC";

    // Convert to user's local timezone for hour checking
    const startLocal = toZonedTime(startTime, timezone);
    const endLocal = toZonedTime(endTime, timezone);

    const dayOfWeek = format(startLocal, "EEEE").toLowerCase();
    const dayConfig = workingHours[`${dayOfWeek}_start`];

    // Check 1: Outside working hours
    if (!dayConfig) {
      violations.push(`${dayOfWeek} is not a working day`);
    } else {
      const dayStart = parse(dayConfig, "HH:mm:ss", startLocal);
      const dayEnd = parse(
        workingHours[`${dayOfWeek}_end`],
        "HH:mm:ss",
        startLocal
      );

      if (isBefore(startLocal, dayStart) || isAfter(endLocal, dayEnd)) {
        violations.push(
          `Task ${format(startLocal, "HH:mm")}-${format(endLocal, "HH:mm")} ` +
            `falls outside working hours ${format(dayStart, "HH:mm")}-${format(dayEnd, "HH:mm")}`
        );
      }

      // Check 2: Conflicts with existing tasks
      const { data: existingTasks } = await (context.supabase as unknown as SupabaseClient)
        .from("scheduling_nodes")
        .select("id, start_time, end_time, title")
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .lt("start_time", endTime.toISOString())
        .gt("end_time", startTime.toISOString());

      const conflicts = existingTasks?.filter((task) => task.id !== data.ignoreTaskId);
      if (conflicts && conflicts.length > 0) {
        violations.push(
          `Conflicts with ${conflicts.length} existing task(s): ` +
            conflicts.map((t) => t.title).join(", ")
        );
      }

      // Check 3: Minimum focus block
      if (data.category === "deep-work") {
        const durationMinutes =
          (endTime.getTime() - startTime.getTime()) / 60000;
        if (durationMinutes < (workingHours.min_focus_block_minutes || 30)) {
          violations.push(
            `Deep work block must be at least ${workingHours.min_focus_block_minutes} minutes`
          );
        }
      }
    }

    const suggestions: ScheduleConstraint["suggestions"] = {};

    // If there are violations, suggest the next available slot
    if (violations.length > 0) {
      const nextSlot = addMinutes(endTime, 15); // 15 min buffer after conflict
      suggestions.earliest_valid_slot = nextSlot.toISOString();

      // Suggest 3 alternative dates
      suggestions.alternative_dates = [
        nextSlot.toISOString(),
        addDays(startTime, 1).toISOString(),
        addDays(startTime, 2).toISOString(),
      ];
    }

    return {
      status: violations.length === 0 ? "valid" : "conflict",
      violations,
      suggestions,
    } as ScheduleConstraint;
  });

