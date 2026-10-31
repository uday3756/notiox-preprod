import type { SupabaseClient, User } from "@supabase/supabase-js";
import { readAppRole, type AppRole } from "./app-role";
import { nextOnboardingStep, onboardingPath, type OnboardingSnapshot } from "./onboarding-state";

export type CanvasDecision = "connected" | "skipped" | "pending";

export async function persistCanvasDecision(
  client: SupabaseClient,
  userId: string,
  decision: Exclude<CanvasDecision, "pending">,
): Promise<void> {
  await client.auth.updateUser({ data: { notio_canvas_decision: decision } });
  try {
    await client
      .from("onboarding_responses")
      .upsert({ user_id: userId, canvas_decision: decision }, { onConflict: "user_id" });
  } catch {
    /* column may be missing until migration */
  }
}

function canvasDecisionFromUser(user: User | null): CanvasDecision | null {
  const raw = user?.user_metadata?.notio_canvas_decision;
  if (raw === "connected" || raw === "skipped" || raw === "pending") return raw;
  return null;
}

export async function loadOnboardingSnapshot(
  client: SupabaseClient,
  user: User,
): Promise<OnboardingSnapshot> {
  const role: AppRole | null = await readAppRole(client, user);
  const { data: hours } = await client
    .from("user_working_hours")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: onboarding } = await client
    .from("onboarding_responses")
    .select("user_id, canvas_decision, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const fromRow = onboarding?.canvas_decision;
  const canvasDecision: OnboardingSnapshot["canvasDecision"] =
    fromRow === "connected" || fromRow === "skipped" || fromRow === "pending"
      ? fromRow
      : canvasDecisionFromUser(user);

  return {
    role,
    canvasDecision,
    personaComplete: Boolean(onboarding?.user_id),
    hoursComplete: Boolean(hours?.id),
  };
}

export async function resolveOnboardingPath(
  client: SupabaseClient,
  user: User,
): Promise<string> {
  const snapshot = await loadOnboardingSnapshot(client, user);
  return onboardingPath(nextOnboardingStep(snapshot));
}
