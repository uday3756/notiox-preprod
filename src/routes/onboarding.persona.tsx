import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { NotioLogo } from "@/components/notio/logo";
import { DolphinCompanion } from "@/components/notio/dolphin-companion";
import { QuickOnboarding } from "@/components/notio/quick-onboarding";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { useSupabaseAuth } from "@/hooks/use-auth";
import {
  AGE_BRACKET_OPTIONS,
  HEARD_FROM_OPTIONS,
  ROLE_OPTIONS,
  STEP_ORDER,
  getPersonaLabel,
  quizProgressPct,
  type AgeBracket,
  type HeardFrom,
  type PersonaQuizAnswers,
  type PersonaQuizStep,
  type PersonaRole,
} from "@/lib/persona-quiz";
import {
  hasCompletedPersonaQuiz,
  persistPersonaQuiz,
} from "@/lib/persona-quiz-persist";

export const Route = createFileRoute("/onboarding/persona")({
  head: () => ({
    meta: [
      { title: "Welcome - Notio" },
      { name: "description", content: "Tell Notio a bit about you." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { legacy?: boolean } => ({ legacy: search.legacy === "1" || search.legacy === true }),
  component: OnboardingEntry,
});

function OnboardingEntry() {
  const { legacy } = Route.useSearch();
  return <div>{FEATURE_FLAGS.workflow && !legacy ? <QuickOnboarding/> : <PersonaQuizPage/>}</div>;
}

function PersonaQuizPage() {
  const navigate = useNavigate();
  const { supabase, userId, loading } = useSupabaseAuth();
  const [ready, setReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<PersonaQuizAnswers>({
    role: null,
    ageBracket: null,
    heardFrom: null,
    motivationScore: null,
  });
  const [motivationDraft, setMotivationDraft] = useState(7);
  const [revealPhase, setRevealPhase] = useState<"idle" | "syncing" | "revealed">(
    "idle",
  );
  const [personaLabel, setPersonaLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const step: PersonaQuizStep = STEP_ORDER[stepIndex] ?? "role";
  const progressPct = quizProgressPct(answers);

  useEffect(() => {
    if (loading) return;
    if (!supabase || !userId) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const done = await hasCompletedPersonaQuiz(userId);
      if (cancelled) return;
      if (done) {
        navigate({ to: "/auth-setup-hours", replace: true });
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, supabase, userId, navigate]);

  function selectAndAdvance<K extends keyof PersonaQuizAnswers>(
    key: K,
    value: PersonaQuizAnswers[K],
  ) {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      return next;
    });
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }

  useEffect(() => {
    if (step !== "reveal" || revealPhase !== "idle" || !userId) return;
    setRevealPhase("syncing");
    const label = getPersonaLabel(answers);
    setPersonaLabel(label);
    setSaving(true);
    void (async () => {
      const { error } = await persistPersonaQuiz(userId, answers, label);
      setSaving(false);
      if (error) {
        toast.error(error);
        setRevealPhase("idle");
        setStepIndex(STEP_ORDER.indexOf("motivation"));
        return;
      }
      window.setTimeout(() => setRevealPhase("revealed"), 1300);
    })();
  }, [step, revealPhase, userId, answers]);

  async function enterNotio() {
    navigate({ to: "/auth-setup-hours", replace: true });
  }

  if (loading || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="notiox-onboarding flex min-h-dvh flex-col bg-background px-6 py-10">
      <div className="mx-auto w-full max-w-md flex-1">
        <div className="mb-8 text-center">
          <NotioLogo className="text-2xl" />
        </div>
        <div className="notiox-onboarding-companion"><DolphinCompanion state="welcome" /></div>

        {/* Progress — text percent only, no iconography */}
        <div className="mb-8">
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>Getting to know you</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === "role" && (
            <QuestionCard
              key="role"
              prompt="Pick your lane —"
              options={ROLE_OPTIONS}
              onSelect={(v) => selectAndAdvance("role", v as PersonaRole)}
            />
          )}
          {step === "age" && (
            <QuestionCard
              key="age"
              prompt="Which age range fits you?"
              options={AGE_BRACKET_OPTIONS}
              onSelect={(v) => selectAndAdvance("ageBracket", v as AgeBracket)}
            />
          )}
          {step === "heardFrom" && (
            <QuestionCard
              key="heardFrom"
              prompt="Where did our paths first cross?"
              options={HEARD_FROM_OPTIONS}
              onSelect={(v) => selectAndAdvance("heardFrom", v as HeardFrom)}
            />
          )}
          {step === "motivation" && (
            <motion.div
              key="motivation"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28 }}
              className="space-y-6"
            >
              <h1 className="font-display text-2xl font-semibold leading-snug text-foreground">
                On a scale of 1–10, how fired up are you to get things done right
                now?
              </h1>
              <div className="space-y-4">
                <div className="flex justify-between px-1 text-xs text-muted-foreground">
                  <span>1</span>
                  <span className="text-lg font-semibold text-foreground">
                    {motivationDraft}
                  </span>
                  <span>10</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={motivationDraft}
                  onChange={(e) => setMotivationDraft(Number(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="Motivation from 1 to 10"
                />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMotivationDraft(n)}
                      className={`min-w-9 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        motivationDraft === n
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border bg-surface text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  selectAndAdvance("motivationScore", motivationDraft)
                }
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95"
              >
                Next
              </button>
            </motion.div>
          )}
          {step === "reveal" && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex min-h-[50vh] flex-col items-center justify-center text-center"
            >
              {revealPhase === "syncing" && (
                <div className="space-y-4">
                  <p className="font-display text-xl font-semibold text-foreground">
                    Calculating your Notio type…
                  </p>
                  <div className="flex justify-center gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-primary"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.2,
                        }}
                      />
                    ))}
                  </div>
                  {saving && (
                    <p className="text-xs text-muted-foreground">Saving…</p>
                  )}
                </div>
              )}
              {revealPhase === "revealed" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 180, damping: 16 }}
                  className="w-full space-y-6"
                >
                  <CelebrationBurst />
                  <p className="text-sm text-muted-foreground">Your Notio type</p>
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                    {personaLabel}
                  </h2>
                  <button
                    type="button"
                    onClick={enterNotio}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95"
                  >
                    Enter Notio
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QuestionCard({
  prompt,
  options,
  onSelect,
}: {
  prompt: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.28 }}
      className="space-y-6"
    >
      <h1 className="font-display text-2xl font-semibold leading-snug text-foreground">
        {prompt}
      </h1>
      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <motion.button
            key={opt.value}
            type="button"
            whileTap={{ scale: 0.97 }}
            animate={
              selected === opt.value ? { scale: [1, 1.03, 1] } : { scale: 1 }
            }
            transition={{ duration: 0.25 }}
            onClick={() => {
              setSelected(opt.value);
              window.setTimeout(() => onSelect(opt.value), 220);
            }}
            className={`rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition ${
              selected === opt.value
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-surface text-foreground hover:border-primary/50"
            }`}
          >
            {opt.label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/** Soft CSS particles — no emoji / icon assets. */
function CelebrationBurst() {
  const dots = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="pointer-events-none relative mx-auto h-16 w-full max-w-xs">
      {dots.map((i) => {
        const angle = (i / dots.length) * Math.PI * 2;
        const x = Math.cos(angle) * 56;
        const y = Math.sin(angle) * 28;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-primary/80"
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], x, y, scale: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
