import { supabase } from "@/integrations/supabase/client";
import type { PersonaQuizAnswers } from "@/lib/persona-quiz";

/**
 * Persist quiz answers + persona label for the signed-in user (RLS).
 * One write at reveal time.
 */
export async function persistPersonaQuiz(
  userId: string,
  answers: PersonaQuizAnswers,
  personaLabel: string,
): Promise<{ error: string | null }> {
  if (
    !answers.role ||
    !answers.ageBracket ||
    !answers.heardFrom ||
    answers.motivationScore == null
  ) {
    return { error: "Quiz incomplete." };
  }

  const { error: rowErr } = await supabase.from("onboarding_responses").upsert(
    {
      user_id: userId,
      role: answers.role,
      age_bracket: answers.ageBracket,
      heard_from: answers.heardFrom,
      motivation_score: answers.motivationScore,
    },
    { onConflict: "user_id" },
  );

  if (rowErr) {
    console.error("[persona] onboarding_responses:", rowErr.message);
    return { error: rowErr.message };
  }

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      persona_label: personaLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileErr) {
    console.error("[persona] profiles.persona_label:", profileErr.message);
    return { error: profileErr.message };
  }

  return { error: null };
}

export async function hasCompletedPersonaQuiz(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("onboarding_responses")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.user_id);
}

/**
 * New users only: no quiz row yet, and no working hours (legacy accounts skip).
 */
export async function needsPersonaQuiz(userId: string): Promise<boolean> {
  if (await hasCompletedPersonaQuiz(userId)) return false;
  const { data: hours } = await supabase
    .from("user_working_hours")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (hours) return false;
  return true;
}
