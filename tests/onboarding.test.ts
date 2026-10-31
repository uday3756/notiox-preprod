import { describe, expect, it } from "vitest";
import { nextOnboardingStep, onboardingPath } from "../src/lib/onboarding-state";

describe("onboarding resolver", () => {
  it("sends students to Canvas before hours", () => {
    expect(
      nextOnboardingStep({
        role: "student",
        canvasDecision: null,
        personaComplete: true,
        hoursComplete: false,
      }),
    ).toBe("canvas");
  });

  it("maps finished onboarding to /home", () => {
    expect(
      onboardingPath(
        nextOnboardingStep({
          role: "other",
          canvasDecision: null,
          personaComplete: true,
          hoursComplete: true,
        }),
      ),
    ).toBe("/home");
  });

  it("resumes skipped Canvas students at persona or hours", () => {
    expect(
      nextOnboardingStep({
        role: "student",
        canvasDecision: "skipped",
        personaComplete: false,
        hoursComplete: false,
      }),
    ).toBe("persona");
  });
});
