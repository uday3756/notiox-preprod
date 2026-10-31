/**
 * Post-signup persona quiz — deterministic labels (not LLM).
 * Text-only options; no decorative icons/symbols in the quiz UI.
 */

export type PersonaRole = "student" | "founder" | "freelancer";
export type AgeBracket =
  | "under_18"
  | "18_24"
  | "25_34"
  | "35_44"
  | "45_54"
  | "55_plus";
export type HeardFrom = "instagram" | "reddit" | "x" | "friend" | "other";

export type PersonaQuizAnswers = {
  role: PersonaRole | null;
  ageBracket: AgeBracket | null;
  heardFrom: HeardFrom | null;
  motivationScore: number | null;
};

export const ROLE_OPTIONS: { value: PersonaRole; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "founder", label: "Founder" },
  { value: "freelancer", label: "Freelancer" },
];

export const AGE_BRACKET_OPTIONS: { value: AgeBracket; label: string }[] = [
  { value: "under_18", label: "Under 18" },
  { value: "18_24", label: "18–24" },
  { value: "25_34", label: "25–34" },
  { value: "35_44", label: "35–44" },
  { value: "45_54", label: "45–54" },
  { value: "55_plus", label: "55+" },
];

export const HEARD_FROM_OPTIONS: { value: HeardFrom; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "reddit", label: "Reddit" },
  { value: "x", label: "X" },
  { value: "friend", label: "Through a friend" },
  { value: "other", label: "Other" },
];

export const STEP_ORDER = [
  "role",
  "age",
  "heardFrom",
  "motivation",
  "reveal",
] as const;
export type PersonaQuizStep = (typeof STEP_ORDER)[number];

/** Endowed progress: start at 20%, +20% per answered question. */
export function quizProgressPct(answers: PersonaQuizAnswers): number {
  const answered = [
    answers.role,
    answers.ageBracket,
    answers.heardFrom,
    answers.motivationScore,
  ].filter((v) => v !== null).length;
  return 20 + answered * 20;
}

function motivationBucket(score: number): "low" | "mid" | "high" {
  if (score <= 3) return "low";
  if (score <= 7) return "mid";
  return "high";
}

/** Placeholder labels from handoff — replace when Julian finalizes copy. */
const PERSONA_LABELS: Record<
  PersonaRole,
  Record<"low" | "mid" | "high", string>
> = {
  student: {
    low: "The Slow Starter",
    mid: "The Steady Student",
    high: "The Deadline Slayer",
  },
  founder: {
    low: "The Idea Incubator",
    mid: "The Steady Builder",
    high: "The Relentless Closer",
  },
  freelancer: {
    low: "The Quiet Grinder",
    mid: "The Balanced Hustler",
    high: "The Spark Chaser",
  },
};

export function getPersonaLabel(answers: PersonaQuizAnswers): string {
  if (!answers.role || answers.motivationScore == null) {
    return "The Notio Newcomer";
  }
  return PERSONA_LABELS[answers.role][motivationBucket(answers.motivationScore)];
}

export function getFormattedDisplayName(profile: {
  displayName: string;
  personaLabel: string | null;
}): string {
  const name = profile.displayName.trim();
  if (!name) return profile.personaLabel?.trim() || "";
  if (!profile.personaLabel?.trim()) return name;
  return `${name} · ${profile.personaLabel.trim()}`;
}
