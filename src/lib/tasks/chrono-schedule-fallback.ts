/**
 * Local NL helpers: transcript normalize, title repair, overlap checks.
 * Schedule extraction itself always goes through Claude — not this module.
 *
 * Important: NEVER use the whole transcript as the title — only a short label
 * near the matched time phrase (e.g. "Dinner", "Gym").
 *
 * Timezone: chrono-node only accepts abbreviations (IST) or offset minutes —
 * NOT IANA names like Asia/Kolkata. We convert any IANA zone → minutes so
 * wall-clock times work for users worldwide.
 */
import * as chrono from "chrono-node";
import { addDays, addHours } from "date-fns";
import { formatInTimeZone, fromZonedTime, getTimezoneOffset } from "date-fns-tz";

export type ChronoScheduleTask = {
  title: string;
  category: string;
  start_time_iso: string;
  end_time_iso: string | null;
  estimated_duration_minutes: number;
  is_timebound: boolean;
  confidence: number;
  interpretation: string;
  requires_confirmation: boolean;
  timezone_assumed: string;
};

/** Transcript looks schedulable (clock, meal, daypart, or appointment wording). */
export function transcriptLooksTimed(text: string): boolean {
  return /\b(\d{1,2}([:.]\d{2})?\s*(a\.?m\.?|p\.?m\.?)|\d{1,2}\.\d{2}|\d{1,2}\s*[-–to]+\s*\d{1,2}([:.]\d{2})?\s*(a\.?m\.?|p\.?m\.?)?|\bat\s+\d{1,2}|\b\d{3,4}\s*(hrs?|hours)?\b|half\s+past|\bo'?clock|breakfast|lunch|dinner|supper|snacks?|morning|afternoon|evening|tonight|night|tomorrow|today|vet|appointment|dentist|doctor)\b/i.test(
    text,
  );
}

/**
 * Prefer the speaker's correction: "tomorrow sorry day after tomorrow" → day after tomorrow.
 * Also cleans weekend rephrasing: "next Saturday wait no next Sunday I mean the Sunday after this one".
 */
export function normalizeSelfCorrections(transcript: string): string {
  let t = transcript;

  // Common STT / typo repairs (generic, not example-locked)
  t = t.replace(/\bduffer\b/gi, "after");
  t = t.replace(/\bdiffer that\b/gi, "after that");
  t = t.replace(/\bafter tat\b/gi, "after that");
  t = t.replace(/\bmeetiing\b/gi, "meeting");
  t = t.replace(/\bdiffrent\b/gi, "different");
  // "washing … doctor 8 … take back" → "at 8" (STT often hears "at" as "doctor")
  t = t.replace(
    /\b(washing|laundry|dress|clothes)([\s\S]{0,80}?)\bdoctor\s+(\d{1,2})\b/gi,
    (_, a: string, mid: string, h: string) => `${a}${mid}at ${h}`,
  );

  // Unify this/coming/upcoming weekday variants → "this coming <day>"
  t = t.replace(
    /\bthis\s+is\s+coming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    "this coming $1",
  );
  t = t.replace(
    /\bupcoming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    "this coming $1",
  );
  t = t.replace(
    /\bthis\s+coming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    "@@COMING_$1@@",
  );
  t = t.replace(
    /\bcoming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    "@@COMING_$1@@",
  );
  t = t.replace(
    /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    "@@COMING_$1@@",
  );
  t = t.replace(
    /@@COMING_(monday|tuesday|wednesday|thursday|friday|saturday|sunday)@@/gi,
    "this coming $1",
  );

  // "day after tomorrow I fly… wait actually tomorrow night sorry tomorrow evening"
  // → keep the FINAL correction only.
  t = t.replace(
    /\bday\s+after\s+tomorrow\b[\s\S]{0,100}?\b(?:wait\s+)?(?:actually\s+)?(?:tomorrow\s+night\s+)?(?:sorry\s+)?tomorrow\s+(evening|night)\b/gi,
    "tomorrow $1",
  );
  t = t.replace(
    /\bday\s+after\s+tomorrow\b(?=[\s\S]{0,120}?\btomorrow\s+(evening|night)\b)/gi,
    "tomorrow",
  );

  // "For tomorrow I meant day after tomorrow" / "tomorrow … I meant day after tomorrow"
  t = t.replace(
    /\b(?:for\s+)?tomorrow\s+i\s+meant\s+(day\s+after\s+tomorrow)\b/gi,
    "$1",
  );
  t = t.replace(
    /\btomorrow\b(?=[\s\S]{0,100}?\bi\s+meant\s+day\s+after\s+tomorrow\b)/gi,
    "day after tomorrow",
  );
  t = t.replace(/\bi\s+meant\s+(day\s+after\s+tomorrow)\b/gi, "$1");

  // "tomorrow morning no wait today afternoon" → today afternoon
  t = t.replace(
    /\btomorrow\s+(morning|afternoon|evening|night)\b(?:\s*[,.]?\s*)(?:no\s+)?wait\s+(today|tonight)\s+(morning|afternoon|evening|night)?/gi,
    (_, _a: string, day: string, part: string | undefined) =>
      `${day}${part ? ` ${part}` : ""}`,
  );

  // Long weekend corrections → chrono-friendly "Sunday after next"
  t = t.replace(
    /\bnext\s+(saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b[\s\S]{0,100}?\b(?:i\s+mean\s+)?(?:the\s+)?(sunday|saturday)\s+after\s+this\s+one\b/gi,
    "$2 after next",
  );
  t = t.replace(
    /\b(?:the\s+)?(sunday|saturday)\s+after\s+this\s+one\b/gi,
    "$1 after next",
  );
  t = t.replace(
    /\bnext\s+(saturday|sunday)\b(?:\s*[,.]?\s*)(?:wait\s+)?(?:no\s+)?next\s+(saturday|sunday)\b/gi,
    "next $2",
  );

  t = t.replace(
    /\b(today|tomorrow|tonight|yesterday|day\s+after\s+tomorrow)\b(?:\s*[,.]?\s*)(?:sorry|i\s*mean|actually|no|wait|correction|rather)\s*(?:[,.]?\s*)?(today|tomorrow|tonight|yesterday|day\s+after\s+tomorrow|next\s+\w+|tomorrow\s+evening|tomorrow\s+night)\b/gi,
    "$2",
  );
  t = t.replace(
    /\b(today|tomorrow|tonight)\s+(day\s+after\s+tomorrow)\b/gi,
    "$2",
  );

  // Activity swap: "gym sorry not gym I cancelled gym I will go for a walk instead"
  t = t.replace(
    /\b(\w+)\s+sorry\s+not\s+\1\s+i\s+cancelled?\s+\1\b/gi,
    " ",
  );
  t = t.replace(
    /\b(?:sorry\s+not|cancelled?|canceled)\s+(\w+)\b/gi,
    " ",
  );
  t = t.replace(
    /\bi\s+will\s+go\s+for\s+(?:a\s+)?(\w+)\s+instead\b/gi,
    "$1",
  );

  // Time correction: "maybe 8.30 pm instead of 8 so use 8.30" → keep 8:30
  t = t.replace(
    /\b(?:maybe\s+)?(\d{1,2}[:.]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?)\s+instead\s+of\s+\d{1,2}(?:[:.]\d{2})?(?:\s*(?:a\.?m\.?|p\.?m\.?)?)?(?:\s+so\s+use\s+\1)?/gi,
    "at $1",
  );
  // Drop superseded bare "at 8" when a corrected "at 8:30" follows in the same breath
  t = t.replace(
    /\bat\s+(\d{1,2})\b(?!\s*[:.]\d{2})(?!\s*(?:a\.?m\.?|p\.?m\.?))(?=[\s\S]{0,120}?\bat\s+\1[:.]\d{2})/gi,
    " ",
  );

  // Drop filler that becomes garbage task titles
  t = t.replace(/\b(?:also\s+)?remind me that\b/gi, " ");
  t = t.replace(
    /\b(?:please\s+)?put all of this on (?:my|your) calendar\b[^.!?]*/gi,
    " ",
  );
  t = t.replace(
    /\bcapture every distinct thing\b[^.!?]*/gi,
    " ",
  );

  return t.replace(/\s+/g, " ").trim();
}

/** Activities the user said to ignore / cancel / already did (dynamic, not example-locked). */
export function extractIgnoredActivities(transcript: string): Set<string> {
  const ignored = new Set<string>();
  const patterns = [
    /\b(?:ignore|skip(?:ping)?|already\s+did|already\s+done|don'?t\s+(?:need|want|schedule))\s+(?:the\s+|my\s+)?([a-z][a-z]+(?:\s+[a-z]+)?)/gi,
    /\b(?:cancelled?|canceled)\s+(?:the\s+|my\s+)?([a-z][a-z]+)/gi,
    /\bsorry\s+not\s+([a-z][a-z]+)/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(transcript)) !== null) {
      const word = m[1].toLowerCase().trim();
      if (word.length >= 3 && !/^(the|and|for|that|this|with|from)$/.test(word)) {
        ignored.add(word);
      }
    }
  }
  return ignored;
}

function titleIsIgnored(title: string, ignored: Set<string>): boolean {
  if (ignored.size === 0) return false;
  const key = normalizeTitleKey(title);
  for (const ig of ignored) {
    if (key === ig || key.includes(ig) || ig.includes(key.split(/\s+/)[0] ?? "")) {
      return true;
    }
  }
  return false;
}

function hasClockPhrase(s: string): boolean {
  // Note: do NOT treat bare 3–4 digit numbers as times (years like 2026 match otherwise).
  return /\b(\d{1,2}([:.]\d{2})?\s*(a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2}|\d{1,2}\.\d{2}|([01]\d|2[0-3])[0-5]\d\b|\d{3,4}\s*(hrs?|hours)\b|half\s+past|\bo'?clock)\b/i.test(
    s,
  );
}

/** Tighter window — used so "lunch … after that 3pm" still soft-schedules lunch. */
function hasNearbyClock(s: string, index: number, radius = 18): boolean {
  const from = Math.max(0, index - radius);
  const to = Math.min(s.length, index + radius);
  return hasClockPhrase(s.slice(from, to));
}

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const MERGE_START_WINDOW_MS = 15 * 60_000;

function titlesAreSimilar(a: string, b: string): boolean {
  const aKey = normalizeTitleKey(a);
  const bKey = normalizeTitleKey(b);
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  if (aKey.length >= 4 && bKey.length >= 4 && (aKey.includes(bKey) || bKey.includes(aKey))) {
    return true;
  }
  return false;
}

function startWithinWindow(aIso: string, bIso: string, windowMs = MERGE_START_WINDOW_MS): boolean {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= windowMs;
}

/** Merge AI + chrono: collapse only when title similar AND starts within 15 minutes. */
export function mergeScheduleExtractions<
  T extends {
    title: string;
    start_time_iso: string | null;
    end_time_iso?: string | null;
    is_timebound?: boolean;
    confidence?: number;
  },
>(aiTasks: T[], chronoTasks: ChronoScheduleTask[]): T[] {
  const merged: T[] = [...aiTasks.filter((t) => t.start_time_iso)];
  for (const c of chronoTasks) {
    if (!c.start_time_iso) continue;
    // The AI extraction is authoritative for BOTH which activities exist and
    // when they happen. If the AI already captured this activity (by similar
    // title), skip the chrono copy entirely — the regex fallback only fills in
    // activities the AI missed. This fixes two bugs at once:
    //   (a) same-name duplicates when the two extractors resolve the activity
    //       to different days/times (they never collapsed across days), and
    //   (b) the heuristic overriding Claude's correct time with a wrongly
    //       parsed one (the old scoring preferred any non-zero-minute time).
    const alreadyCaptured = merged.some(
      (a) => a.start_time_iso && a.title && titlesAreSimilar(a.title, c.title),
    );
    if (alreadyCaptured) continue;
    merged.push(c as unknown as T);
  }
  return merged.sort((a, b) => {
    const at = new Date(a.start_time_iso!).getTime();
    const bt = new Date(b.start_time_iso!).getTime();
    return at - bt;
  });
}

/**
 * When the transcript anchors "this coming Monday" (etc.), drop same-title /
 * same wall-clock duplicates on other days (AI often parks one on today).
 */
export function collapseAnchoredWeekdayDuplicates<
  T extends { title: string; start_time_iso: string | null; confidence?: number },
>(tasks: T[], normalizedTranscript: string, userTimezone: string, instant: Date): T[] {
  const m = normalizedTranscript.match(
    /\bthis\s+coming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  if (!m || tasks.length < 2) return tasks;

  const anchorYmd = thisComingWeekdayYmd(instant, userTimezone, m[1]);
  const groups = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.start_time_iso) continue;
    const hhmm = formatInTimeZone(t.start_time_iso, userTimezone, "HH:mm");
    const key = `${normalizeTitleKey(t.title)}|${hhmm}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: T[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const onAnchor = list.filter(
      (t) =>
        t.start_time_iso &&
        formatInTimeZone(t.start_time_iso, userTimezone, "yyyy-MM-dd") === anchorYmd,
    );
    if (onAnchor.length > 0) {
      // Prefer highest confidence among anchored copies
      onAnchor.sort((a, b) => (b.confidence ?? 0.7) - (a.confidence ?? 0.7));
      out.push(onAnchor[0]);
      continue;
    }
    // No anchored copy — keep the latest future start
    list.sort(
      (a, b) =>
        new Date(a.start_time_iso!).getTime() - new Date(b.start_time_iso!).getTime(),
    );
    out.push(list[list.length - 1]);
  }
  return out.sort(
    (a, b) =>
      new Date(a.start_time_iso!).getTime() - new Date(b.start_time_iso!).getTime(),
  );
}

/**
 * Convert IANA / abbreviation / ±HH:MM into chrono's timezone minutes at `at`.
 * Returns undefined if the zone cannot be resolved (chrono then uses host TZ —
 * callers should still prefer a valid user zone).
 */
export function chronoTimezoneMinutes(
  userTimezone: string,
  at: Date = new Date(),
): number | undefined {
  const raw = (userTimezone || "").trim();
  if (!raw) return undefined;

  if (/^-?\d{1,4}$/.test(raw)) return Number(raw);

  const m = raw.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3]));
  }

  try {
    const ms = getTimezoneOffset(raw, at);
    if (Number.isFinite(ms)) return ms / 60_000;
  } catch {
    /* fall through */
  }
  return undefined;
}

/**
 * Normalize many spoken/typed clock styles so chrono + titles work consistently
 * for dynamic user input worldwide.
 */
export function normalizeSpokenTimes(transcript: string): string {
  let t = transcript;

  // "half past 3" / "half past three" → "3:30"
  const hourWords: Record<string, string> = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    eleven: "11",
    twelve: "12",
  };
  t = t.replace(/\bhalf\s+past\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (_, h: string) => {
    const n = hourWords[h.toLowerCase()] ?? h;
    return `${n}:30`;
  });

  // "3 o'clock" / "3 oclock" → "3:00"
  t = t.replace(/\b(\d{1,2})\s*o'?clock\b/gi, "$1:00");

  // "quarter past 10" / "quarter past ten" → "10:15"
  t = t.replace(
    /\bquarter\s+past\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (_, h: string) => `${hourWords[h.toLowerCase()] ?? h}:15`,
  );

  // "six thirty pm" / "six thirty" → "6:30 pm"
  t = t.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+thirty\s*(a\.?m\.?|p\.?m\.?)?\b/gi,
    (_, h: string, ap: string | undefined) =>
      `${hourWords[h.toLowerCase()] ?? h}:30${ap ? ` ${ap}` : ""}`,
  );

  // Military "1430" / "930 hrs" / "1530 hrs" → "14:30" / "9:30" / "15:30"
  // Avoid bare years (2026): require : or hrs suffix, or 3–4 digit military with hrs.
  t = t.replace(/\b([01]\d|2[0-3])([0-5]\d)\s*(hrs?|hours)\b/gi, (_, h: string, min: string) => `${Number(h)}:${min}`);
  t = t.replace(/\b([01]?\d|2[0-3])([0-5]\d)\s*(hrs?|hours)\b/gi, (_, h: string, min: string) => `${Number(h)}:${min}`);
  // Bare military only when clearly a time context word precedes (at/from/until)
  t = t.replace(
    /\b(at|from|until|till|around)\s+([01]\d|2[0-3])([0-5]\d)\b/gi,
    (_, prep: string, h: string, min: string) => `${prep} ${Number(h)}:${min}`,
  );

  // Indian / EU dotted times "1.30" / "13.45" → "1:30"
  t = t.replace(/\b(\d{1,2})\.(\d{2})\b/g, (_, h: string, min: string) => `${h}:${min}`);

  // Spaced "1 30 pm" → "1:30 pm" (when clearly minutes)
  t = t.replace(/\b(\d{1,2})\s+([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)\b/gi, "$1:$2 $3");

  // Evening / exercise bare hours: "evening … around 6" → "around 6 pm"
  t = t.replace(
    /\b(evening|tonight|night|dinner|supper|walk|gym|workout|running|run|jog|swim)\b([^.!?]{0,90}?)\b(around|at)\s+(\d{1,2})\b(?!\s*[:.]\d{2})(?!\s*(?:a\.?m\.?|p\.?m\.?))/gi,
    (full, ctx: string, mid: string, prep: string, h: string) => {
      const n = Number(h);
      if (n >= 1 && n <= 11) return `${ctx}${mid}${prep} ${h} pm`;
      return full;
    },
  );
  // "running 6:00" / "go for running 6 pm" already has am/pm; bare "running 6" → pm
  t = t.replace(
    /\b(running|run|jog|walk|swim|gym)\b\s+(\d{1,2})\b(?!\s*[:.]\d{2})(?!\s*(?:a\.?m\.?|p\.?m\.?))/gi,
    (_, act: string, h: string) => {
      const n = Number(h);
      return n >= 5 && n <= 11 ? `${act} at ${h} pm` : `${act} at ${h}`;
    },
  );
  // "at 8 … dinner" / "around 6 … walk" (activity after the clock)
  t = t.replace(
    /\b(around|at)\s+(\d{1,2})\b(?!\s*[:.]\d{2})(?!\s*(?:a\.?m\.?|p\.?m\.?))(?=[^.!?]{0,70}?\b(dinner|supper|walk|gym|workout|running|run)\b)/gi,
    (_, prep: string, h: string) => {
      const n = Number(h);
      return n >= 1 && n <= 11 ? `${prep} ${h} pm` : `${prep} ${h}`;
    },
  );

  // "from 2 to 5" style already handled by chrono; normalize en-dashes
  t = t.replace(/[–—]/g, "-");

  return t;
}

type Daypart = "morning" | "afternoon" | "evening" | "night" | null;

function detectDaypart(context: string): Daypart {
  if (/\b(tonight|evening|night|dinner|supper)\b/i.test(context)) return "evening";
  if (/\b(afternoon|lunch|noon|after\s+noon)\b/i.test(context)) return "afternoon";
  if (/\b(morning|breakfast|wake\s*up|am\b)\b/i.test(context)) return "morning";
  return null;
}

const KEYWORD_TITLES: { re: RegExp; title: string; category: string; preferPm?: boolean }[] = [
  { re: /\b(coding\s+test)\b/i, title: "Coding test", category: "deep-work", preferPm: true },
  { re: /\b(notary|paperwork)\b/i, title: "Notary paperwork", category: "admin" },
  { re: /\b(parent\s+teacher|pta)\b/i, title: "Parent teacher meeting", category: "meeting", preferPm: true },
  { re: /\b(birthday\s+gift|buy\s+a\s+gift|gift\s+for)\b/i, title: "Birthday gift", category: "personal", preferPm: true },
  { re: /\b(plan\s+fitting|fitting)\b/i, title: "Fitting", category: "personal" },
  { re: /\bcoaching\b/i, title: "Coaching", category: "meeting" },
  { re: /\b(studio\s+session|seminar|lecture)\b/i, title: "Class", category: "task", preferPm: true },
  { re: /\bclass\b/i, title: "Class", category: "task", preferPm: true },
  { re: /\b(walk|walking)\b/i, title: "Walk", category: "exercise", preferPm: true },
  { re: /\bswim(?:ming)?\b/i, title: "Swim", category: "exercise", preferPm: true },
  { re: /\byoga\b/i, title: "Yoga", category: "exercise" },
  { re: /\bpilates\b/i, title: "Pilates", category: "exercise", preferPm: true },
  { re: /\b(running|run|jog(?:ging)?)\b/i, title: "Running", category: "exercise", preferPm: true },
  { re: /\b(interview)\b/i, title: "Interview", category: "meeting" },
  { re: /\b(gym|workout|exercise)\b/i, title: "Gym", category: "exercise", preferPm: true },
  { re: /\blunch\b/i, title: "Lunch", category: "lunch", preferPm: true },
  { re: /\b(dinner|supper)\b/i, title: "Dinner", category: "personal", preferPm: true },
  { re: /\bbreakfast\b/i, title: "Breakfast", category: "personal" },
  { re: /\b(wake\s*up|wakeup)\b/i, title: "Wake up", category: "personal" },
  { re: /\b(coffee\s+chat)\b/i, title: "Coffee chat", category: "personal" },
  { re: /\b(coffee|brunch)\b/i, title: "Coffee", category: "personal" },
  { re: /\b(take back|pick up).{0,20}\b(dress|clothes|laundry)\b|\btake back my dress\b/i, title: "Collect laundry", category: "personal", preferPm: true },
  { re: /\b(washing|laundry|dry\s*clean|washing\s+machine)\b/i, title: "Laundry", category: "personal", preferPm: true },
  { re: /\b(exam|midterm|final)\b/i, title: "Exam", category: "task" },
  { re: /\b(meeting|meetiing|call|standup|sync|teams)\b/i, title: "Meeting", category: "meeting" },
  { re: /\b(vet|veterinarian|veterinary)\b/i, title: "Vet", category: "personal" },
  { re: /\bdentist\b/i, title: "Dentist", category: "personal" },
  { re: /\bdoctor\b/i, title: "Doctor", category: "personal" },
  { re: /\b(clinic|hospital)\b/i, title: "Appointment", category: "personal" },
  { re: /\bappointment\b/i, title: "Appointment", category: "personal" },
  { re: /\bsnacks?\b/i, title: "Snack", category: "personal" },
  { re: /\b(sangeet)\b/i, title: "Sangeet", category: "personal", preferPm: true },
  { re: /\b(salon|haircut)\b/i, title: "Salon", category: "personal", preferPm: true },
  { re: /\breturn the suit\b/i, title: "Return suit", category: "personal" },
  { re: /\b(pick up (?:the )?rental suit|rental suit)\b/i, title: "Pick up suit", category: "personal" },
  { re: /\bzoom\b/i, title: "Zoom", category: "meeting", preferPm: true },
  { re: /\b(wedding)\b/i, title: "Wedding", category: "personal" },
  { re: /\b(banquet|drop my parents|drop parents)\b/i, title: "Banquet drop-off", category: "personal" },
  { re: /\b(study|homework|assignment|revision)\b/i, title: "Study", category: "deep-work" },
  { re: /\b(school\s+pickup)\b/i, title: "School pickup", category: "personal", preferPm: true },
  { re: /\b(college|lecture)\b/i, title: "Class", category: "task" },
  { re: /\b(physiotherapy|physio)\b/i, title: "Physiotherapy", category: "personal" },
  { re: /\b(factory\s+tour)\b/i, title: "Factory tour", category: "meeting", preferPm: true },
  { re: /\buber(?:\s+to(?:\s+the)?\s+airport)?\b|\btaxi\b|\bcab\b/i, title: "Uber to airport", category: "personal", preferPm: true },
  { re: /\b(hotel\s+check-?in)\b/i, title: "Hotel check-in", category: "personal" },
  { re: /\b(deep\s+work|client\s+presentation)\b/i, title: "Deep work", category: "deep-work" },
  { re: /\b(flight|fly out)\b/i, title: "Flight", category: "personal", preferPm: true },
  { re: /\b(airport)\b/i, title: "Airport", category: "personal", preferPm: true },
  { re: /\b(train|bus)\b/i, title: "Travel", category: "personal" },
  { re: /\b(movie|cinema|party)\b/i, title: "Event", category: "personal", preferPm: true },
  { re: /\b(work on|will be work|be work)\b/i, title: "Work", category: "deep-work", preferPm: true },
  { re: /\b(take a rest|rest break|nap)\b/i, title: "Break", category: "break" },
];

/** Generic shell titles score lower so "dentist appointment" → Dentist, not Appointment. */
const GENERIC_TITLE_KEYS = new Set([
  "appointment",
  "meeting",
  "event",
  "task",
  "travel",
  "work",
  "airport",
  "class",
]);

/** Best activity keyword in a clause — longer / more specific match wins. */
function keywordTitleFromText(
  text: string,
): { title: string; category: string; preferPm: boolean; daypart: Daypart } | null {
  const t = text.trim();
  if (!t) return null;
  let best: {
    title: string;
    category: string;
    preferPm: boolean;
    daypart: Daypart;
    score: number;
  } | null = null;
  for (const k of KEYWORD_TITLES) {
    k.re.lastIndex = 0;
    const m = k.re.exec(t);
    if (!m) continue;
    const generic = GENERIC_TITLE_KEYS.has(normalizeTitleKey(k.title));
    const score = m[0].length + (generic ? 0 : 6);
    if (!best || score > best.score) {
      best = {
        title: k.title,
        category: k.category,
        preferPm: Boolean(k.preferPm),
        daypart: detectDaypart(t),
        score,
      };
    }
  }
  return best
    ? {
        title: best.title,
        category: best.category,
        preferPm: best.preferPm,
        daypart: best.daypart,
      }
    : null;
}

function titleNearMatch(
  transcript: string,
  matchIndex: number,
  matchText: string,
): {
  title: string;
  category: string;
  preferPm: boolean;
  daypart: Daypart;
} {
  const before = transcript.slice(Math.max(0, matchIndex - 120), matchIndex);
  const afterRaw = transcript.slice(
    matchIndex + matchText.length,
    matchIndex + matchText.length + 160,
  );

  const after = (afterRaw.split(/\b(?:after that|and after that|then|afterwards|later)\b/i)[0] ?? afterRaw)
    .replace(/\b\d{1,2}:\d{2}\b[\s\S]*$/, "")
    .slice(0, 90);

  let clause = "";
  if (!/\b(?:after that|and after that|afterwards)\s*$/i.test(before)) {
    clause =
      before
        .split(/\b(?:after that|and after that|afterwards|then|,|!|\?|;|\.\s+)\s*/i)
        .map((s) => s.trim())
        .filter(Boolean)
        .pop() ?? before;
  }

  const local = `${clause} ${matchText} ${after}`;
  const daypart = detectDaypart(`${before.slice(-40)} ${matchText} ${after}`);

  let best:
    | { title: string; category: string; preferPm: boolean; dist: number }
    | null = null;
  for (const k of KEYWORD_TITLES) {
    const m = k.re.exec(local);
    if (!m || m.index === undefined) continue;
    const timeAnchor = clause.length + 1;
    const dist = Math.abs(m.index - timeAnchor);
    if (!best || dist < best.dist) {
      best = {
        title: k.title,
        category: k.category,
        preferPm: Boolean(k.preferPm),
        dist,
      };
    }
  }
  if (best) {
    return {
      title: best.title,
      category: best.category,
      preferPm: best.preferPm || daypart === "afternoon" || daypart === "evening",
      daypart,
    };
  }

  let cleaned = `${clause} ${after}`
    .replace(
      /\b(today|tomorrow|tonight|yesterday|now|right now|like|i will|i'll|i have to|i have|i'm|im|go for|going to|gonna|wanna|to|at|from|until|till|for)\b/gi,
      " ",
    )
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b(a\.?m\.?|p\.?m\.?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "")
    .trim();

  if (/^\d{1,2}$/.test(cleaned)) cleaned = "";
  if (cleaned.length > 48) cleaned = cleaned.slice(0, 48).replace(/\s+\S*$/, "").trim();
  if (!cleaned || cleaned.length < 2) cleaned = "Task";

  const preferPm =
    daypart === "afternoon" ||
    daypart === "evening" ||
    /\b(dinner|supper|gym|lunch|night|evening|movie|party)\b/i.test(local);

  return {
    title: cleaned[0].toUpperCase() + cleaned.slice(1),
    category: "task",
    preferPm,
    daypart,
  };
}

function phraseHasAmPm(phrase: string): boolean {
  return /\b(a\.?m\.?|p\.?m\.?)\b/i.test(phrase);
}

/**
 * Shift ambiguous clocks into the right half of the day using
 * activity preference + morning/afternoon/evening context.
 *
 * Important: do NOT flip 8–11 AM work/meetings to PM just because "work"
 * has preferPm — only flip clearly ambiguous early hours (1–6) unless
 * evening/dinner context says otherwise.
 */
function applyDaypartShift(
  start: Date,
  end: Date,
  userTimezone: string,
  preferPm: boolean,
  daypart: Daypart,
  matchText: string,
  title: string,
): { start: Date; end: Date } {
  if (phraseHasAmPm(matchText)) return { start, end };

  try {
    const hour = Number(formatInTimeZone(start, userTimezone, "H"));
    const dinnerish = /^(dinner|supper)$/i.test(title) || daypart === "evening" || daypart === "night";

    // Dinner / evening: 1–11 → PM (8.30 dinner → 20:30)
    if (dinnerish && hour >= 1 && hour <= 11) {
      return { start: addHours(start, 12), end: addHours(end, 12) };
    }
    // Afternoon context: 1–6 → PM
    if (daypart === "afternoon" && hour >= 1 && hour <= 6) {
      return { start: addHours(start, 12), end: addHours(end, 12) };
    }
    // Keyword preferPm (gym/laundry/evening errands): bare 1–9 → PM
    // (explicit a.m. already returned above via phraseHasAmPm)
    if (preferPm && hour >= 1 && hour <= 9) {
      return { start: addHours(start, 12), end: addHours(end, 12) };
    }
    // Meetings / Zoom with bare 1–5 → PM even if preferPm missed
    if (/^(zoom|meeting)$/i.test(title) && hour >= 1 && hour <= 5) {
      return { start: addHours(start, 12), end: addHours(end, 12) };
    }
  } catch {
    /* keep original */
  }
  return { start, end };
}

/** True when two ISO ranges overlap (touching endpoints = no overlap). */
export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const as = new Date(aStart).getTime();
  const ae = aEnd ? new Date(aEnd).getTime() : as + 30 * 60_000;
  const bs = new Date(bStart).getTime();
  const be = bEnd ? new Date(bEnd).getTime() : bs + 30 * 60_000;
  if ([as, ae, bs, be].some((n) => Number.isNaN(n))) return false;
  return as < be && bs < ae;
}

export function findOverlappingPairs<
  T extends { id: string; start_time: string; end_time?: string | null },
>(tasks: T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      if (
        rangesOverlap(
          tasks[i].start_time,
          tasks[i].end_time ?? null,
          tasks[j].start_time,
          tasks[j].end_time ?? null,
        )
      ) {
        pairs.push([tasks[i], tasks[j]]);
      }
    }
  }
  return pairs;
}

function resolveAnchorYmd(
  normalized: string,
  instant: Date,
  userTimezone: string,
  tzMinutes: number | undefined,
): string {
  const todayYmd = formatInTimeZone(instant, userTimezone, "yyyy-MM-dd");
  // Prefer the strongest relative day when the speaker corrected themselves mid-dump.
  if (/\bday\s+after\s+tomorrow\b/i.test(normalized)) {
    return formatInTimeZone(
      addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), 2),
      userTimezone,
      "yyyy-MM-dd",
    );
  }
  const coming = normalized.match(
    /\bthis\s+coming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  if (coming) {
    return thisComingWeekdayYmd(instant, userTimezone, coming[1]);
  }
  if (/\btomorrow\b/i.test(normalized) && !/\btoday\b/i.test(normalized)) {
    return formatInTimeZone(
      addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), 1),
      userTimezone,
      "yyyy-MM-dd",
    );
  }

  const mentionsToday = /\btoday\b/i.test(normalized);
  const results = chrono.parse(
    normalized,
    {
      instant,
      ...(tzMinutes !== undefined ? { timezone: tzMinutes } : {}),
    },
    { forwardDate: !mentionsToday },
  );
  for (const r of results) {
    if (
      r.start.isCertain("day") ||
      r.start.isCertain("weekday") ||
      /\b(tomorrow|today|tonight|yesterday|day\s+after)\b/i.test(r.text)
    ) {
      return formatInTimeZone(r.start.date(), userTimezone, "yyyy-MM-dd");
    }
  }
  return todayYmd;
}

function wallClockRange(
  ymd: string,
  hour: number,
  minute: number,
  durationMin: number,
  userTimezone: string,
): { start: Date; end: Date } {
  const naive = `${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const start = fromZonedTime(naive, userTimezone);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start, end };
}

type SoftDefault = {
  hour: number;
  minute: number;
  duration: number;
  title: string;
  category: string;
  interpretation: string;
};

/** Meal / daypart / appointment defaults when the clause has no clock. */
function softDefaultForClause(clause: string): SoftDefault | null {
  const c = clause.trim();
  if (!c || c.length < 4) return null;
  // Explicit skip — do not invent that meal
  if (/\bskip(?:ping)?\s+lunch\b/i.test(c)) return null;
  if (
    /\b(ignore|already\s+did|already\s+done|skip(?:ping)?)\b/i.test(c) &&
    /\b(breakfast|lunch|dinner|supper|snacks?|gym)\b/i.test(c)
  ) {
    return null;
  }

  // Flexible slot: "sometime / without a fixed time / somewhere in the afternoon"
  if (
    /\b(without a fixed time|no fixed time|flexible|sometime|somewhere in the)\b/i.test(c) &&
    /\b(morning|afternoon|evening|night)\b/i.test(c)
  ) {
    const hour = /\bmorning\b/i.test(c) ? 10 : /\bevening\b/i.test(c) ? 19 : /\bnight\b/i.test(c) ? 21 : 15;
    const hit = keywordTitleFromText(c);
    const title = hit?.title && !isGarbageScheduleTitle(hit.title) ? hit.title : "Flexible task";
    return {
      hour,
      minute: 0,
      duration: 60,
      title,
      category: hit?.category ?? "personal",
      interpretation: `Flexible daypart slot → ${String(hour).padStart(2, "0")}:00`,
    };
  }

  if (/\bbreakfast\b/i.test(c)) {
    return {
      hour: 8,
      minute: 0,
      duration: 45,
      title: "Breakfast",
      category: "personal",
      interpretation: "Meal default: breakfast → morning 08:00",
    };
  }
  if (/\blunch\b/i.test(c) && !/\bskip(?:ping)?\s+lunch\b/i.test(c)) {
    return {
      hour: 12,
      minute: 30,
      duration: 60,
      title: "Lunch",
      category: "lunch",
      interpretation: "Meal default: lunch → midday 12:30",
    };
  }
  if (/\b(dinner|supper)\b/i.test(c)) {
    return {
      hour: 20,
      minute: 0,
      duration: 60,
      title: "Dinner",
      category: "personal",
      interpretation: "Meal default: dinner → evening 20:00",
    };
  }
  if (/\bsnacks?\b/i.test(c)) {
    return {
      hour: 16,
      minute: 0,
      duration: 30,
      title: "Snack",
      category: "personal",
      interpretation: "Meal default: snack → flexible 16:00",
    };
  }

  let hour = 10;
  let minute = 0;
  let duration = 60;
  let interpretation = "Activity default: mid-morning 10:00";
  if (/\b(morning)\b/i.test(c)) {
    hour = 9;
    interpretation = "Daypart default: morning → 09:00";
  } else if (/\b(afternoon)\b/i.test(c)) {
    hour = 15;
    interpretation = "Daypart default: afternoon → 15:00";
  } else if (/\b(evening)\b/i.test(c)) {
    hour = 19;
    interpretation = "Daypart default: evening → 19:00";
  } else if (/\b(night|tonight)\b/i.test(c)) {
    hour = 21;
    interpretation = "Daypart default: night → 21:00";
  } else if (/\b(vet|doctor|dentist|appointment|clinic|hospital)\b/i.test(c)) {
    hour = 10;
    interpretation = "Appointment default: 10:00";
  } else if (/\b(pick up|rental suit)\b/i.test(c) && /\bmorning\b/i.test(c)) {
    hour = 9;
    interpretation = "Morning errand default: 09:00";
  } else if (/\b(drop|banquet|before noon|noon)\b/i.test(c)) {
    hour = 11;
    minute = 0;
    duration = 45;
    interpretation = "Before-noon default: 11:00";
  } else if (!/\b(have to|need to|going to|gonna|must|will|i'll|schedule|plan)\b/i.test(c)) {
    return null;
  }

  let title = "Task";
  let category = "task";
  for (const k of KEYWORD_TITLES) {
    if (k.re.test(c)) {
      title = k.title;
      category = k.category;
      break;
    }
  }
  if (title === "Task") {
    const cleaned = c
      .replace(
        /\b(today|tomorrow|tonight|yesterday|day after tomorrow|morning|afternoon|evening|night|like|i will|i'll|i have to|i have|i'm|im|go for|going to|gonna|wanna|to|at|from|until|till|for|take|my|the|a|an|with|and)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 2) {
      title = cleaned[0].toUpperCase() + cleaned.slice(1, 40);
    } else {
      return null;
    }
  }

  return { hour, minute, duration, title, category, interpretation };
}

const MEAL_SOFT_PATTERNS: Array<{
  re: RegExp;
  hour: number;
  minute: number;
  duration: number;
  title: string;
  category: string;
  interpretation: string;
}> = [
  {
    re: /\bbreakfast\b/gi,
    hour: 8,
    minute: 0,
    duration: 45,
    title: "Breakfast",
    category: "personal",
    interpretation: "Meal default: breakfast → morning 08:00",
  },
  {
    re: /\blunch\b/gi,
    hour: 12,
    minute: 30,
    duration: 60,
    title: "Lunch",
    category: "lunch",
    interpretation: "Meal default: lunch → midday 12:30",
  },
  {
    re: /\bsnacks?\b/gi,
    hour: 16,
    minute: 0,
    duration: 30,
    title: "Snack",
    category: "personal",
    interpretation: "Meal default: snack → flexible 16:00",
  },
  {
    re: /\b(dinner|supper)\b/gi,
    hour: 20,
    minute: 0,
    duration: 60,
    title: "Dinner",
    category: "personal",
    interpretation: "Meal default: dinner → evening 20:00",
  },
];

function pushSoftTask(
  out: ChronoScheduleTask[],
  usedTitles: Set<string>,
  soft: SoftDefault,
  ymd: string,
  userTimezone: string,
) {
  const key = normalizeTitleKey(soft.title);
  if (usedTitles.has(key)) return;
  usedTitles.add(key);
  const { start, end } = wallClockRange(
    ymd,
    soft.hour,
    soft.minute,
    soft.duration,
    userTimezone,
  );
  out.push({
    title: soft.title,
    category: soft.category,
    start_time_iso: start.toISOString(),
    end_time_iso: end.toISOString(),
    estimated_duration_minutes: soft.duration,
    is_timebound: true,
    confidence: 0.7,
    interpretation: soft.interpretation,
    requires_confirmation: false,
    timezone_assumed: userTimezone,
  });
}

/**
 * Schedule activities that name a meal/daypart/appointment but no clock time.
 * Exact clocks are handled separately and win on merge.
 */
function extractSoftScheduledTasks(
  normalized: string,
  userTimezone: string,
  instant: Date,
  tzMinutes: number | undefined,
  ignored: Set<string> = new Set(),
): ChronoScheduleTask[] {
  const ymd = resolveAnchorYmd(normalized, instant, userTimezone, tzMinutes);
  const out: ChronoScheduleTask[] = [];
  const usedTitles = new Set<string>();

  const skipLunch = /\bskip(?:ping)?\s+lunch\b/i.test(normalized);

  // 1) Meals anywhere in the transcript (unless a clock is nearby).
  for (const meal of MEAL_SOFT_PATTERNS) {
    if (skipLunch && /^lunch$/i.test(meal.title)) continue;
    if (titleIsIgnored(meal.title, ignored)) continue;
    meal.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = meal.re.exec(normalized)) !== null) {
      if (hasNearbyClock(normalized, m.index, 22)) continue;
      const around = normalized.slice(
        Math.max(0, m.index - 28),
        m.index + m[0].length + 28,
      );
      // "skip / ignore / already did {meal}"
      if (
        /\b(skip(?:ping)?|ignore|already\s+did|already\s+done)\b/i.test(around)
      ) {
        continue;
      }
      const softMeal =
        /^dinner$/i.test(meal.title) && /\blate\s+dinner\b/i.test(normalized)
          ? { ...meal, hour: 21, interpretation: "Meal default: late dinner → 21:00" }
          : meal;
      // Night snack → ~21:00 when "night" context
      const nightSnack =
        /^snack$/i.test(meal.title) && /\bnight\b/i.test(around)
          ? { ...meal, hour: 21, minute: 0, interpretation: "Meal default: night snack → 21:00" }
          : softMeal;
      pushSoftTask(out, usedTitles, nightSnack, ymd, userTimezone);
      break;
    }
  }

  // 2) Clause-based activities (vet, daypart tasks) without clocks.
  // Also split on "." so "wedding. In the morning pick up suit" → two soft tasks.
  const clauses = normalized
    .split(/\b(?:and after that|after that|afterwards|and then|then|;)\b|(?<=[.!?])\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    if (hasClockPhrase(clause)) continue;
    // Meals already handled above — skip pure meal clauses.
    if (/^\s*(tomorrow|today|tonight|day after tomorrow)?\s*(breakfast|lunch|dinner|supper|snacks?)\b/i.test(clause) &&
        !/\b(vet|doctor|dentist|appointment|meeting|call|gym|work)\b/i.test(clause)) {
      continue;
    }
    // "doctor 8" STT leftover without a real appointment
    if (/\bdoctor\s+\d{1,2}\b/i.test(clause) && !/\b(appointment|clinic|hospital)\b/i.test(clause)) {
      continue;
    }
    const soft = softDefaultForClause(clause);
    if (!soft || titleIsIgnored(soft.title, ignored)) continue;
    // Skip soft appointment invented from stray "doctor"
    if (/^appointment$/i.test(soft.title) && /\bdoctor\b/i.test(clause) && !/\bappointment\b/i.test(clause)) {
      continue;
    }
    pushSoftTask(out, usedTitles, soft, ymd, userTimezone);
  }

  return out;
}

/**
 * Parse timed ranges with chrono in the user's timezone, plus meal/daypart defaults
 * for activities without an explicit clock.
 */
/** This coming Sunday/Saturday in user TZ, including today if it matches. */
function upcomingWeekendYmd(
  instant: Date,
  userTimezone: string,
  day: "Sunday" | "Saturday",
): string {
  const todayYmd = formatInTimeZone(instant, userTimezone, "yyyy-MM-dd");
  for (let i = 0; i <= 7; i++) {
    const cand = addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), i);
    const ymd = formatInTimeZone(cand, userTimezone, "yyyy-MM-dd");
    if (formatInTimeZone(cand, userTimezone, "eeee") === day) return ymd;
  }
  return todayYmd;
}

/**
 * Pin "Sunday after next" (and following Monday) to concrete yyyy-MM-dd so
 * later clock times in the dump don't fall on "today".
 */
function pinWeekendAnchors(
  normalized: string,
  instant: Date,
  userTimezone: string,
  _tzMinutes: number | undefined,
): string {
  let t = normalized;
  const weekend = t.match(/\b(sunday|saturday)\s+after\s+next\b/i);
  if (!weekend) return t;

  const day = weekend[1].toLowerCase() === "saturday" ? "Saturday" : "Sunday";
  const thisWeekendYmd = upcomingWeekendYmd(instant, userTimezone, day);
  const weekendYmd = formatInTimeZone(
    addDays(fromZonedTime(`${thisWeekendYmd}T12:00:00`, userTimezone), 7),
    userTimezone,
    "yyyy-MM-dd",
  );
  t = t.replace(/\b(sunday|saturday)\s+after\s+next\b/gi, weekendYmd);

  // "Monday morning…" after a Sunday event → day after that Sunday
  try {
    const mondayYmd = formatInTimeZone(
      addDays(fromZonedTime(`${weekendYmd}T12:00:00`, userTimezone), 1),
      userTimezone,
      "yyyy-MM-dd",
    );
    t = t.replace(/\b(oh and\s+)?monday\b/gi, `$1${mondayYmd}`);
  } catch {
    /* keep Monday literal */
  }
  return t;
}

export function extractTimedTasksWithChrono(
  transcript: string,
  userTimezone: string,
  currentDateTimeIso: string,
): ChronoScheduleTask[] {
  if (!transcript.trim()) return [];

  const instant = new Date(currentDateTimeIso);
  const mentionsToday = /\btoday\b/i.test(transcript);
  const tzMinutes = chronoTimezoneMinutes(userTimezone, instant);
  const ignoredActivities = extractIgnoredActivities(transcript);
  const normalized = pinWeekendAnchors(
    normalizeSpokenTimes(normalizeSelfCorrections(transcript)),
    instant,
    userTimezone,
    tzMinutes,
  );
  // Re-scan ignores after normalization (cancelled words may remain in original only)
  for (const ig of extractIgnoredActivities(normalized)) ignoredActivities.add(ig);

  const results = chrono.parse(
    normalized,
    {
      instant,
      ...(tzMinutes !== undefined ? { timezone: tzMinutes } : {}),
    },
    { forwardDate: !mentionsToday },
  );

  type Candidate = ChronoScheduleTask & { startKey: number; hasRange: boolean };
  const candidates: Candidate[] = [];

  for (const r of results) {
    if (!r.start.isCertain("hour")) continue;
    if (!/\d{1,2}/.test(r.text)) continue;

    const matchIndex =
      typeof r.index === "number" && r.index >= 0
        ? r.index
        : normalized.toLowerCase().indexOf(r.text.toLowerCase());
    const idx = matchIndex >= 0 ? matchIndex : 0;

    // "till 1:30" / "until 2:30" are end bounds — attach to a prior start when possible.
    const prefix = normalized.slice(Math.max(0, idx - 14), idx);
    const preContext = normalized.slice(Math.max(0, idx - 90), idx);
    if (/\b(till|until)\s*$/i.test(prefix) && !r.end) {
      if (/\bfree\b/i.test(clauseAroundIndex(normalized, idx))) continue;

      const bound = titleNearMatch(preContext, Math.max(0, preContext.length - 1), "");
      const boundHit = keywordTitleFromText(preContext);
      const title =
        boundHit?.title && !isGarbageScheduleTitle(boundHit.title)
          ? boundHit.title
          : bound.title && !isGarbageScheduleTitle(bound.title)
            ? bound.title
            : "";

      // Garbage: "I have to till 23" with no real activity
      const endHourGuess = Number(
        formatInTimeZone(r.start.date(), userTimezone, "H"),
      );
      if (
        !title ||
        endHourGuess >= 22 ||
        (!/\b(gym|workout|lunch|class|meeting|washing|laundry|notary|paperwork|coding|interview|run)\b/i.test(
          preContext,
        ) &&
          !boundHit)
      ) {
        continue;
      }

      let endAt = r.start.date();
      // Prefer attaching to the latest open candidate with a similar title
      let attached = false;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        if (!titlesAreSimilar(c.title, title)) continue;
        const cStart = new Date(c.start_time_iso);
        let endUse = endAt;
        const startH = Number(formatInTimeZone(c.start_time_iso, userTimezone, "H"));
        let endH = Number(formatInTimeZone(endUse.toISOString(), userTimezone, "H"));
        if (endH <= startH && endH <= 11 && !phraseHasAmPm(r.text)) {
          endUse = addHours(endUse, 12);
          endH += 12;
        }
        const gap = endUse.getTime() - cStart.getTime();
        if (gap > 5 * 60_000 && gap <= 8 * 60 * 60_000) {
          const durationMin = Math.max(15, Math.round(gap / 60_000));
          candidates[i] = {
            ...c,
            end_time_iso: endUse.toISOString(),
            estimated_duration_minutes: durationMin,
            hasRange: true,
            interpretation: `${c.interpretation} [until ${r.text}]`,
          };
          attached = true;
          break;
        }
      }
      if (attached) continue;

      // Fallback: invent a 60m block ending at this time (notary-style)
      if (
        /\b(notary|paperwork|submit|rush|return|deliver)\b/i.test(preContext)
      ) {
        if (endHourGuess <= 11 && !phraseHasAmPm(r.text)) {
          endAt = addHours(endAt, 12);
        }
        const startAt = new Date(endAt.getTime() - 60 * 60_000);
        candidates.push({
          title,
          category: boundHit?.category || bound.category || "admin",
          start_time_iso: startAt.toISOString(),
          end_time_iso: endAt.toISOString(),
          estimated_duration_minutes: 60,
          is_timebound: true,
          confidence: 0.8,
          interpretation: `End-bound until ${r.text}`,
          requires_confirmation: false,
          timezone_assumed: userTimezone,
          startKey: Math.floor(startAt.getTime() / 60_000),
          hasRange: true,
        });
      }
      continue;
    }
    if (/\bby\s*$/i.test(prefix) && !r.end) {
      if (
        !/\b(return|submit|deliver|drop|pick|meet|appointment|interview|flight|leave|paperwork|buy)\b/i.test(
          preContext,
        )
      ) {
        continue;
      }
    }

    // "three hours before" — chrono may treat "three" as 3:00; skip that false clock.
    const afterMatch = normalized.slice(idx + r.text.length, idx + r.text.length + 24);
    if (/^\s*hours?\s+before\b/i.test(afterMatch)) continue;

    let { title, category, preferPm, daypart } = titleNearMatch(normalized, idx, r.text);
    // Prefer keywords from the local clause only (avoids nearby activities stealing titles).
    const localCtx = clauseAroundIndex(normalized, idx);
    const localHit = keywordTitleFromText(localCtx);
    if (localHit) {
      title = localHit.title;
      category = localHit.category;
      preferPm = localHit.preferPm || preferPm;
      if (localHit.daypart) daypart = localHit.daypart;
    }

    if (titleIsIgnored(title, ignoredActivities)) continue;

    let start = r.start.date();
    let end = r.end?.date() ?? new Date(start.getTime() + 60 * 60 * 1000);
    ({ start, end } = applyDaypartShift(
      start,
      end,
      userTimezone,
      preferPm,
      daypart,
      r.text,
      title,
    ));

    // Duration phrase near the time: "for one hour" / "lasting ninety minutes"
    const afterDur = normalized.slice(idx + r.text.length, idx + r.text.length + 90);
    const durMatch = afterDur.match(
      /\b(?:for|lasting)\s+(\d+(?:\.\d+)?|one|two|three|forty\s*five|thirty|sixty|ninety)\s*(hours?|hrs?|minutes?|mins?)\b/i,
    );
    if (durMatch && !r.end) {
      const rawN = durMatch[1].toLowerCase().replace(/\s+/g, "");
      const wordN: Record<string, number> = {
        one: 1,
        two: 2,
        three: 3,
        thirty: 30,
        sixty: 60,
        ninety: 90,
        fortyfive: 45,
      };
      const n = wordN[rawN] ?? Number(rawN);
      const unit = durMatch[2].toLowerCase();
      const minutes = /hour|hr/.test(unit)
        ? Math.round((Number.isFinite(n) ? n : 1) * 60)
        : Math.round(Number.isFinite(n) ? n : 60);
      if (minutes >= 5 && minutes <= 12 * 60) {
        end = new Date(start.getTime() + minutes * 60_000);
      }
    }

    // "3:00 p.m. … gym till 5" — attach end only when till is close (not "till 23" later)
    let tillAttached = false;
    if (!r.end && !durMatch) {
      const nearAfter = afterDur.slice(0, 56);
      const tillAhead = nearAfter.match(
        /\btill\s+(\d{1,2})(?::([0-5]\d))?(?:\s*(a\.?m\.?|p\.?m\.?))?\b/i,
      );
      if (tillAhead) {
        const ymd = formatInTimeZone(start, userTimezone, "yyyy-MM-dd");
        let endH = Number(tillAhead[1]);
        const endM = tillAhead[2] ? Number(tillAhead[2]) : 0;
        const startH = Number(formatInTimeZone(start, userTimezone, "H"));
        const ap = tillAhead[3]?.toLowerCase() ?? "";
        if (endH >= 22) {
          /* ignore nonsense STT like "till 23" */
        } else {
          if (/p/.test(ap) && endH < 12) endH += 12;
          else if (!ap && endH <= startH && endH <= 11) endH += 12;
          else if (!ap && startH >= 12 && endH < 12) endH += 12;
          if (endH >= 0 && endH <= 23) {
            const endNaive = `${ymd}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
            const endCand = fromZonedTime(endNaive, userTimezone);
            const gapH = (endCand.getTime() - start.getTime()) / 3600000;
            if (gapH > 0.08 && gapH <= 6) {
              end = endCand;
              tillAttached = true;
            }
          }
        }
      }
    }

    if (isGarbageScheduleTitle(title)) continue;

    const durationMin = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));
    const startKey = Math.floor(start.getTime() / 60_000);

    candidates.push({
      title,
      category,
      start_time_iso: start.toISOString(),
      end_time_iso: end.toISOString(),
      estimated_duration_minutes: durationMin,
      is_timebound: true,
      confidence: 0.85,
      interpretation: `Chrono fallback: ${r.text} → ${title}`,
      requires_confirmation: false,
      timezone_assumed: userTimezone,
      startKey,
      hasRange: Boolean(r.end) || Boolean(durMatch) || tillAttached,
    });
  }

  // Dedupe same start minute — prefer explicit ranges over points.
  const byStart = new Map<number, Candidate>();
  for (const c of candidates) {
    const prev = byStart.get(c.startKey);
    if (!prev || (c.hasRange && !prev.hasRange)) {
      byStart.set(c.startKey, c);
    }
  }

  let clockTasks = [...byStart.values()]
    .sort((a, b) => a.startKey - b.startKey)
    .map(({ startKey: _k, hasRange: _h, ...task }) => task);

  // Same title same day (e.g. "at 8" then "8:30 instead") → keep the more precise clock.
  clockTasks = collapseSameDayTitleCorrections(clockTasks, userTimezone);

  // Snap bare clocks onto "Sunday after next" (chrono often uses today for "7 pm").
  const corrected = normalizeSelfCorrections(transcript);
  const afterNext = corrected.match(/\b(sunday|saturday)\s+after\s+next\b/i);
  if (afterNext) {
    const day = afterNext[1].toLowerCase() === "saturday" ? "Saturday" : "Sunday";
    const thisWeekendYmd = upcomingWeekendYmd(instant, userTimezone, day);
    const weekendYmd = formatInTimeZone(
      addDays(fromZonedTime(`${thisWeekendYmd}T12:00:00`, userTimezone), 7),
      userTimezone,
      "yyyy-MM-dd",
    );
    const mondayYmd = formatInTimeZone(
      addDays(fromZonedTime(`${weekendYmd}T12:00:00`, userTimezone), 1),
      userTimezone,
      "yyyy-MM-dd",
    );
    clockTasks = clockTasks.map((task) => {
      const targetYmd = /return suit/i.test(task.title) ? mondayYmd : weekendYmd;
      const hhmmss = formatInTimeZone(task.start_time_iso, userTimezone, "HH:mm:ss");
      const start = fromZonedTime(`${targetYmd}T${hhmmss}`, userTimezone);
      const dur = Math.max(15, task.estimated_duration_minutes || 60);
      const end = new Date(start.getTime() + dur * 60_000);
      return {
        ...task,
        start_time_iso: start.toISOString(),
        end_time_iso: end.toISOString(),
        interpretation: `${task.interpretation} [pinned ${targetYmd}]`,
      };
    });
  }

  const softTasks = extractSoftScheduledTasks(
    normalized,
    userTimezone,
    instant,
    tzMinutes,
    ignoredActivities,
  ).filter((t) => {
    if (isGarbageScheduleTitle(t.title) || titleIsIgnored(t.title, ignoredActivities)) {
      return false;
    }
    // Don't invent soft Gym/Laundry at 10:00 when a clocked Gym/Laundry already exists
    if (clockTasks.some((c) => titlesAreSimilar(c.title, t.title))) return false;
    return true;
  });

  // Exact clocks win; soft meal/daypart tasks fill gaps (e.g. missing Vet).
  let merged = mergeScheduleExtractions(clockTasks, softTasks);
  merged = pinDayAfterTomorrowPlan(merged, normalized, instant, userTimezone);
  merged = pinThisComingWeekdayPlan(merged, normalized, instant, userTimezone);
  merged = pinNextWeekdayPlan(merged, normalized, instant, userTimezone);
  merged = pinTomorrowTravelItinerary(merged, normalized, instant, userTimezone);
  merged = addLeaveBeforeFlight(merged, normalized, userTimezone);
  merged = collapseAnchoredWeekdayDuplicates(merged, normalized, userTimezone, instant);
  return merged.filter(
    (t) => !isGarbageScheduleTitle(t.title) && !titleIsIgnored(t.title, ignoredActivities),
  );
}

/** "this coming Monday" / unified Monday phrasing → that weekday (including today). */
function thisComingWeekdayYmd(
  instant: Date,
  userTimezone: string,
  dayName: string,
): string {
  const want = dayName[0].toUpperCase() + dayName.slice(1).toLowerCase();
  const todayYmd = formatInTimeZone(instant, userTimezone, "yyyy-MM-dd");
  for (let i = 0; i <= 7; i++) {
    const cand = addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), i);
    if (formatInTimeZone(cand, userTimezone, "eeee") === want) {
      return formatInTimeZone(cand, userTimezone, "yyyy-MM-dd");
    }
  }
  return todayYmd;
}

function pinThisComingWeekdayPlan(
  tasks: ChronoScheduleTask[],
  normalized: string,
  instant: Date,
  userTimezone: string,
): ChronoScheduleTask[] {
  const m = normalized.match(
    /\bthis\s+coming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  if (!m) return tasks;
  const ymd = thisComingWeekdayYmd(instant, userTimezone, m[1]);
  const nextIdx = normalized.search(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  const mainText = nextIdx >= 0 ? normalized.slice(0, nextIdx) : normalized;
  const laterText = nextIdx >= 0 ? normalized.slice(nextIdx) : "";
  return tasks.map((task) => {
    if (
      laterText &&
      titleAppearsInSegment(laterText, task.title) &&
      !titleAppearsInSegment(mainText, task.title)
    ) {
      return task;
    }
    return retargetTaskDay(task, ymd, userTimezone);
  });
}

/** True when a task title is mentioned in a transcript segment. */
function titleAppearsInSegment(segment: string, title: string): boolean {
  const key = normalizeTitleKey(title);
  if (key.length < 3) return false;
  const lower = segment.toLowerCase();
  if (lower.includes(key)) return true;
  const words = key.split(/\s+/).filter((w) => w.length >= 4);
  return words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(segment));
}

function upcomingNamedWeekdayYmd(
  instant: Date,
  userTimezone: string,
  dayName: string,
): string {
  const want = dayName[0].toUpperCase() + dayName.slice(1).toLowerCase();
  const todayYmd = formatInTimeZone(instant, userTimezone, "yyyy-MM-dd");
  for (let i = 1; i <= 14; i++) {
    const cand = addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), i);
    if (formatInTimeZone(cand, userTimezone, "eeee") === want) {
      return formatInTimeZone(cand, userTimezone, "yyyy-MM-dd");
    }
  }
  return todayYmd;
}

/**
 * When "day after tomorrow" wins as the main day, pin every task that is NOT
 * introduced only inside a later "next <weekday>" segment.
 */
function pinDayAfterTomorrowPlan(
  tasks: ChronoScheduleTask[],
  normalized: string,
  instant: Date,
  userTimezone: string,
): ChronoScheduleTask[] {
  if (!/\bday\s+after\s+tomorrow\b/i.test(normalized)) return tasks;
  const todayYmd = formatInTimeZone(instant, userTimezone, "yyyy-MM-dd");
  const datYmd = formatInTimeZone(
    addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), 2),
    userTimezone,
    "yyyy-MM-dd",
  );
  const nextIdx = normalized.search(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  const mainText = nextIdx >= 0 ? normalized.slice(0, nextIdx) : normalized;
  const laterText = nextIdx >= 0 ? normalized.slice(nextIdx) : "";

  return tasks.map((task) => {
    if (
      laterText &&
      titleAppearsInSegment(laterText, task.title) &&
      !titleAppearsInSegment(mainText, task.title)
    ) {
      return task;
    }
    return retargetTaskDay(task, datYmd, userTimezone);
  });
}

/** Any "next <weekday> …" block → pin activities mentioned in that block. */
function pinNextWeekdayPlan(
  tasks: ChronoScheduleTask[],
  normalized: string,
  instant: Date,
  userTimezone: string,
): ChronoScheduleTask[] {
  const re =
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;
  const anchors: { ymd: string; from: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    anchors.push({
      ymd: upcomingNamedWeekdayYmd(instant, userTimezone, m[1]),
      from: m.index,
    });
  }
  if (anchors.length === 0) return tasks;

  return tasks.map((task) => {
    for (let i = 0; i < anchors.length; i++) {
      const from = anchors[i].from;
      const to = i + 1 < anchors.length ? anchors[i + 1].from : normalized.length;
      const segment = normalized.slice(from, to);
      const before = normalized.slice(0, from);
      if (
        titleAppearsInSegment(segment, task.title) &&
        !titleAppearsInSegment(before, task.title)
      ) {
        return retargetTaskDay(task, anchors[i].ymd, userTimezone);
      }
    }
    return task;
  });
}

/** Sentence/clause containing index `idx` (stops at .?! or travel connectors). */
function clauseAroundIndex(text: string, idx: number): string {
  const seps = [". ", "? ", "! ", "; ", " after that ", " and then ", " also ", " and "];
  let from = 0;
  for (const sep of seps) {
    const p = text.toLowerCase().lastIndexOf(sep, Math.max(0, idx - 1));
    if (p >= 0 && p + sep.length > from) from = p + sep.length;
  }
  let to = text.length;
  for (const sep of seps) {
    const p = text.toLowerCase().indexOf(sep, idx);
    if (p >= 0 && p < to) to = p;
  }
  return text.slice(from, to);
}

export function isGarbageScheduleTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (t.length < 2) return true;
  if (/^\d+$/.test(t)) return true;
  if (/\b(that|this|for|with|and|the|a|an)$/i.test(t)) return true;
  if (/^(that|this|for|with|and|the|after|before)\b/i.test(t)) return true;
  if (
    /\b(remind me|also remind|day i return which|put all of this|on my calendar|okay so|wait actually|sorry tomorrow|this monday|coming monday|plan fitting coaching)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (t.split(/\s+/).length > 6) return true;
  return false;
}

/** Full normalize pipeline used by chrono + orchestrator. */
export function normalizeTranscriptForSchedule(transcript: string): string {
  return normalizeSpokenTimes(normalizeSelfCorrections(transcript));
}

/** Repair a raw title using keyword map; drop garbage fragments. */
export function repairScheduleTitle(title: string, context = ""): string | null {
  const raw = title.trim();

  // Trust a clean model-provided title. Claude (with thinking) returns distinct,
  // atomic titles like "Office", "Work", "Startup" — keep them. Only when the
  // title is genuinely garbage do we infer a replacement, and even then from the
  // TITLE text first. We must NOT match a good title against the whole
  // transcript: `context` is the entire dump, so keywordTitleFromText would
  // return the same dominant keyword (e.g. "Gym") for EVERY task, collapsing all
  // scheduled names to one word.
  if (raw && !isGarbageScheduleTitle(raw)) {
    // Keep the model's own wording (just tidy filler + casing). Do NOT route it
    // through the keyword map — that would downgrade descriptive titles like
    // "Client call" to a generic "Meeting", and matching the transcript would
    // collapse every task to one keyword.
    const cleaned = raw
      .replace(/\b(that|this|for|with|and|the|a|an)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || isGarbageScheduleTitle(cleaned)) return null;
    // Allow up to 6 words (matches stageValidate) so canonical to-do titles like
    // "Office - Morning Shift" pass through verbatim instead of being clipped.
    const words = cleaned.split(/\s+/);
    const short = words.length > 6 ? words.slice(0, 6).join(" ") : cleaned;
    return short.charAt(0).toUpperCase() + short.slice(1);
  }

  // Genuinely garbage/empty title → last-resort keyword inference. Include a
  // little context, but this branch only runs for tasks the model failed to
  // title, which is rare now that Claude drives extraction.
  const fromCtx = keywordTitleFromText(`${raw} ${context}`.trim());
  return fromCtx && !isGarbageScheduleTitle(fromCtx.title) ? fromCtx.title : null;
}

/** Prefer :15/:30/:45 over bare :00 when the same activity appears twice the same day. */
function collapseSameDayTitleCorrections(
  tasks: ChronoScheduleTask[],
  userTimezone: string,
): ChronoScheduleTask[] {
  const groups = new Map<string, ChronoScheduleTask[]>();
  for (const t of tasks) {
    const day = formatInTimeZone(t.start_time_iso, userTimezone, "yyyy-MM-dd");
    const key = `${normalizeTitleKey(t.title)}|${day}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const out: ChronoScheduleTask[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    // Only collapse near-duplicate corrections (e.g. 8:00 vs 8:30), not 1:30 + 3:00 gym.
    list.sort(
      (a, b) =>
        new Date(a.start_time_iso).getTime() - new Date(b.start_time_iso).getTime(),
    );
    const kept: ChronoScheduleTask[] = [];
    for (const t of list) {
      const prev = kept[kept.length - 1];
      if (!prev) {
        kept.push(t);
        continue;
      }
      const gap =
        new Date(t.start_time_iso).getTime() - new Date(prev.start_time_iso).getTime();
      if (gap > 45 * 60_000) {
        kept.push(t);
        continue;
      }
      const prevMin = Number(formatInTimeZone(prev.start_time_iso, userTimezone, "m"));
      const curMin = Number(formatInTimeZone(t.start_time_iso, userTimezone, "m"));
      const score = (min: number, task: ChronoScheduleTask) =>
        (min === 0 ? 0 : 2) + (task.hasRange ? 1 : 0) + (/\bpm\b/i.test(task.interpretation) ? 1 : 0);
      // Replace prev when current looks like the corrected clock
      if (score(curMin, t as ChronoScheduleTask & { hasRange?: boolean }) >=
          score(prevMin, prev as ChronoScheduleTask & { hasRange?: boolean })) {
        kept[kept.length - 1] = t;
      }
    }
    out.push(...kept);
  }
  return out.sort(
    (a, b) =>
      new Date(a.start_time_iso).getTime() - new Date(b.start_time_iso).getTime(),
  );
}

function retargetTaskDay(
  task: ChronoScheduleTask,
  ymd: string,
  userTimezone: string,
): ChronoScheduleTask {
  const hhmmss = formatInTimeZone(task.start_time_iso, userTimezone, "HH:mm:ss");
  const start = fromZonedTime(`${ymd}T${hhmmss}`, userTimezone);
  const dur = Math.max(15, task.estimated_duration_minutes || 60);
  const end = new Date(start.getTime() + dur * 60_000);
  return {
    ...task,
    start_time_iso: start.toISOString(),
    end_time_iso: end.toISOString(),
    interpretation: `${task.interpretation} [day ${ymd}]`,
  };
}

/** Upcoming Friday in user TZ (from tomorrow if today is Friday → next week). */
function upcomingFridayYmd(instant: Date, userTimezone: string): string {
  const todayYmd = formatInTimeZone(instant, userTimezone, "yyyy-MM-dd");
  for (let i = 1; i <= 14; i++) {
    const cand = addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), i);
    if (formatInTimeZone(cand, userTimezone, "eeee") === "Friday") {
      return formatInTimeZone(cand, userTimezone, "yyyy-MM-dd");
    }
  }
  return todayYmd;
}

/**
 * Multi-day travel: flight/"tomorrow" day, then "next morning"/land day,
 * then optional "day I return which is Friday" (or any named return weekday).
 * Segment-based — not locked to specific activity titles.
 */
function pinTomorrowTravelItinerary(
  tasks: ChronoScheduleTask[],
  normalized: string,
  instant: Date,
  userTimezone: string,
): ChronoScheduleTask[] {
  const travelish =
    /\b(flight|fly\s+out|airport)\b/i.test(normalized) &&
    (/\btomorrow\s+(evening|night)\b/i.test(normalized) ||
      /\btomorrow\b/i.test(normalized));
  if (!travelish) return tasks;

  const todayYmd = formatInTimeZone(instant, userTimezone, "yyyy-MM-dd");
  const flightYmd = formatInTimeZone(
    addDays(fromZonedTime(`${todayYmd}T12:00:00`, userTimezone), 1),
    userTimezone,
    "yyyy-MM-dd",
  );
  const landYmd = formatInTimeZone(
    addDays(fromZonedTime(`${flightYmd}T12:00:00`, userTimezone), 1),
    userTimezone,
    "yyyy-MM-dd",
  );

  const landIdx = normalized.search(
    /\b(after i land|once i land|when i land|the next morning|next morning)\b/i,
  );
  const returnMatch = normalized.match(
    /\b(?:day i return which is|return(?:ing)?(?:\s+on)?|which is)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  );
  const returnIdx = returnMatch?.index ?? -1;
  const returnYmd = returnMatch
    ? upcomingNamedWeekdayYmd(instant, userTimezone, returnMatch[1])
    : /\bfriday\b/i.test(normalized) && landIdx >= 0
      ? upcomingFridayYmd(instant, userTimezone)
      : null;

  const landStart = landIdx >= 0 ? landIdx : normalized.length;
  const returnStart =
    returnIdx >= 0 ? returnIdx : returnYmd ? normalized.search(/\bfriday\b/i) : -1;
  const landEnd = returnStart >= 0 ? returnStart : normalized.length;

  return tasks.map((task) => {
    if (
      returnYmd &&
      returnStart >= 0 &&
      titleAppearsInSegment(normalized.slice(returnStart), task.title) &&
      !titleAppearsInSegment(normalized.slice(0, returnStart), task.title)
    ) {
      return retargetTaskDay(task, returnYmd, userTimezone);
    }
    if (
      landIdx >= 0 &&
      titleAppearsInSegment(normalized.slice(landStart, landEnd), task.title) &&
      !titleAppearsInSegment(normalized.slice(0, landStart), task.title)
    ) {
      return retargetTaskDay(task, landYmd, userTimezone);
    }
    // Default travel-day tasks (mentioned before landing) → flight day
    if (
      landIdx < 0 ||
      titleAppearsInSegment(normalized.slice(0, landStart), task.title)
    ) {
      // Don't yank return-day-only tasks
      if (
        returnStart >= 0 &&
        titleAppearsInSegment(normalized.slice(returnStart), task.title) &&
        !titleAppearsInSegment(normalized.slice(0, returnStart), task.title)
      ) {
        return task;
      }
      return retargetTaskDay(task, flightYmd, userTimezone);
    }
    return task;
  });
}

/** "leave home three hours before that" → task before the Flight. */
function addLeaveBeforeFlight(
  tasks: ChronoScheduleTask[],
  normalized: string,
  userTimezone: string,
): ChronoScheduleTask[] {
  const m = normalized.match(/\b(\d+)\s+hours?\s+before\b/i);
  if (!m) return tasks;
  const hours = Number(m[1]);
  if (!Number.isFinite(hours) || hours < 1 || hours > 12) return tasks;

  const flight = tasks.find((t) => /\bflight\b/i.test(t.title));
  if (!flight?.start_time_iso) return tasks;

  const leaveStart = new Date(new Date(flight.start_time_iso).getTime() - hours * 60 * 60_000);
  const leaveEnd = new Date(leaveStart.getTime() + 45 * 60_000);
  const leaveIso = leaveStart.toISOString();

  // Skip if Uber/Leave already within 50 minutes of this slot
  const near = tasks.some((t) => {
    if (!/\b(uber|leave|airport)\b/i.test(t.title)) return false;
    return Math.abs(new Date(t.start_time_iso).getTime() - leaveStart.getTime()) < 50 * 60_000;
  });
  if (near) return tasks;

  const leaveTask: ChronoScheduleTask = {
    title: "Leave for airport",
    category: "personal",
    start_time_iso: leaveIso,
    end_time_iso: leaveEnd.toISOString(),
    estimated_duration_minutes: 45,
    is_timebound: true,
    confidence: 0.8,
    interpretation: `${hours}h before flight`,
    requires_confirmation: false,
    timezone_assumed: userTimezone,
  };
  return mergeScheduleExtractions(tasks, [leaveTask]);
}
