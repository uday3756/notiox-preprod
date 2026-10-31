// Local-only "talking style" profile (Feature 7 / generation-effect mechanic).
//
// When a user explains a concept in their own words, we route that text two ways:
//   (a) the explanation itself  -> Supabase, as map content (handled by the caller)
//   (b) the user's *talking style* -> derived here and stored LOCAL-ONLY on device
//
// The style profile NEVER leaves the device as stored state. It is only passed
// per-request into the model prompt so generated node labels match how this
// person actually phrases things. Web equivalent of the RN AsyncStorage version.

const KEY = "notio_style_profile_v1";

export type StyleSignals = {
  /** rolling average words per sentence */
  avgSentenceLength: number;
  /** rolling average characters per word (a rough vocabulary/complexity proxy) */
  avgWordLength: number;
  /** filler / casual markers the user leans on, most-frequent first */
  fillers: string[];
  /** how many explanations have been folded into this profile */
  samples: number;
};

const FILLER_WORDS = [
  "like", "basically", "actually", "kinda", "sorta", "honestly", "literally",
  "you know", "i mean", "so", "right", "okay", "well", "just",
];

const EMPTY: StyleSignals = {
  avgSentenceLength: 0,
  avgWordLength: 0,
  fillers: [],
  samples: 0,
};

/** Pull measurable style signals out of a chunk of the user's own writing. */
export function extractStyleSignals(text: string): StyleSignals {
  const trimmed = text.trim();
  if (!trimmed) return { ...EMPTY };

  const sentences = trimmed.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const lower = ` ${trimmed.toLowerCase()} `;

  const avgSentenceLength = sentences.length ? words.length / sentences.length : words.length;
  const avgWordLength = words.length
    ? words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z']/g, "").length, 0) / words.length
    : 0;

  const fillers = FILLER_WORDS.filter((f) => lower.includes(` ${f} `));

  return {
    avgSentenceLength: round1(avgSentenceLength),
    avgWordLength: round1(avgWordLength),
    fillers,
    samples: 1,
  };
}

/** Fold a new sample into the existing profile with a running average. */
export function mergeStyleSignals(prev: StyleSignals, next: StyleSignals): StyleSignals {
  const n = (prev.samples || 0) + next.samples;
  if (!n) return { ...EMPTY };
  const weight = (a: number, b: number) =>
    round1((a * (prev.samples || 0) + b * next.samples) / n);

  const fillers = Array.from(new Set([...prev.fillers, ...next.fillers])).slice(0, 8);

  return {
    avgSentenceLength: weight(prev.avgSentenceLength, next.avgSentenceLength),
    avgWordLength: weight(prev.avgWordLength, next.avgWordLength),
    fillers,
    samples: n,
  };
}

/** Read the stored profile (or null if none / not in a browser). */
export function getStyleProfile(): StyleSignals | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StyleSignals) : null;
  } catch {
    return null;
  }
}

/** Derive signals from new text and merge them into the local profile. */
export function updateLocalStyleProfile(text: string): void {
  if (typeof window === "undefined" || !text.trim()) return;
  try {
    const prev = getStyleProfile() ?? EMPTY;
    const merged = mergeStyleSignals(prev, extractStyleSignals(text));
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // localStorage may be unavailable (private mode); style matching is best-effort.
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
