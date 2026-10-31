import type { AppRole } from "./app-role";

export type OnboardingStep =
  | "role"
  | "canvas"
  | "persona"
  | "hours"
  | "app";

export type OnboardingSnapshot = {
  role: AppRole | null;
  canvasDecision: "connected" | "skipped" | "pending" | null;
  personaComplete: boolean;
  hoursComplete: boolean;
};

/** Pure resolver. Never stores tokens. */
export function nextOnboardingStep(s: OnboardingSnapshot): OnboardingStep {
  if (!s.role) return "role";
  if (s.role === "student" && (s.canvasDecision === "pending" || s.canvasDecision == null)) {
    return "canvas";
  }
  if (!s.personaComplete) return "persona";
  if (!s.hoursComplete) return "hours";
  return "app";
}

export function onboardingPath(step: OnboardingStep): string {
  switch (step) {
    case "role":
      return "/onboarding/role";
    case "canvas":
      return "/onboarding/role";
    case "persona":
      return "/onboarding/persona";
    case "hours":
      return "/auth-setup-hours";
    default:
      return "/home";
  }
}
