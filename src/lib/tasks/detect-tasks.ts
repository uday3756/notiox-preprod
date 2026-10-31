/**
 * CR-01 §2 — On-device task extraction (no LLM).
 *
 * detectTasks(text) runs on the text of BOTH a capture dump and a journal
 * entry the moment it's saved. It uses chrono-node, a natural-language date
 * parser that runs locally — no network, no tokens, instant. If chrono finds a
 * date/time we create a task; if it doesn't, nothing happens and the
 * dump/journal behaves exactly as before.
 *
 * Why no model here: date detection is deterministic work a library does
 * better, cheaper, and offline. An LLM would add latency, cost, and a failure
 * mode for something chrono.parse() nails. The model stays out of this path.
 */
import * as chrono from "chrono-node";

export type DetectedTask = {
  title: string;
  dueAt: Date;
  hasTime: boolean;
};

// Filler phrases that commonly precede a task ("I have a dentist appointment"
// → "dentist appointment"). Stripped from the front of the title only.
const LEADING_FILLER = [
  "i have a",
  "i have an",
  "i have",
  "i need to",
  "i gotta",
  "gotta",
  "i have to",
  "i must",
  "remember to",
  "reminder to",
  "remind me to",
  "don't forget to",
  "dont forget to",
  "need to",
  "have to",
  "make sure to",
  "make sure i",
  "let me",
  "we have a",
  "we have",
  "there's a",
  "theres a",
  "the",
];

// Trailing connector words left dangling after the date phrase is removed
// ("call landlord back" from "call landlord back monday at noon" is fine, but
// "submit the report by" → drop the trailing "by").
const TRAILING_CONNECTORS = ["at", "on", "by", "this", "next", "for", "in", "to", "the", "a", "an"];

/** Remove the matched date phrase from the text, leaving the task wording. */
function stripDatePhrase(text: string, phrase: string): string {
  if (!phrase) return text;
  // Remove the first occurrence of the exact matched phrase.
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return text;
  return (text.slice(0, idx) + text.slice(idx + phrase.length)).replace(/\s+/g, " ").trim();
}

/**
 * Strip filler, trim punctuation/connectors, and capitalize the first letter →
 * a short task label.
 */
function cleanTitle(s: string): string {
  let out = s.replace(/\s+/g, " ").trim();

  // Drop leading filler phrases (longest match first).
  const lower = out.toLowerCase();
  for (const filler of [...LEADING_FILLER].sort((a, b) => b.length - a.length)) {
    if (lower.startsWith(filler + " ")) {
      out = out.slice(filler.length).trim();
      break;
    }
  }

  // Drop a dangling trailing connector ("submit report by" → "submit report").
  const words = out.split(" ");
  while (words.length > 1 && TRAILING_CONNECTORS.includes(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  out = words.join(" ");

  // Trim stray punctuation at both ends.
  out = out.replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "").trim();

  // Capitalize the first letter.
  if (out.length > 0) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

/**
 * Detect zero or more dated tasks in free text.
 *
 * - forwardDate: "Friday" / "3pm" always resolve to the NEXT occurrence, so a
 *   reminder is never created in the past.
 * - hasTime is true only when a clock time was actually spoken ("3pm Friday"),
 *   false for a bare day ("Friday") — that distinction drives whether an alarm
 *   fires (see notifications) vs. list-only.
 */
// A real reminder title is short. If stripping one date phrase from the text
// still leaves a long blob, the text is a multi-event paragraph (chrono returns
// one match per time phrase, each yielding "the whole paragraph minus one
// phrase"). Storing that as a task title is the bug we're guarding against —
// multi-event paragraphs are scheduled by the AI extractor, not here.
const MAX_TITLE_LEN = 120;

export function detectTasks(text: string, ref: Date = new Date()): DetectedTask[] {
  if (!text || !text.trim()) return [];

  const results = chrono.parse(text, ref, { forwardDate: true });

  return results
    .map((r) => {
      const dueAt = r.start.date();
      const hasTime = r.start.isCertain("hour"); // "Friday" = false; "3pm Friday" = true
      const title = cleanTitle(stripDatePhrase(text, r.text));
      return { title: title || "Untitled task", dueAt, hasTime };
    })
    // Guard against chrono emitting an invalid date.
    .filter((t) => t.dueAt instanceof Date && !Number.isNaN(t.dueAt.getTime()))
    // Never store a paragraph as a task title — a genuine reminder is short.
    .filter((t) => t.title.length <= MAX_TITLE_LEN);
}
