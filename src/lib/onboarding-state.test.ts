import { describe, expect, it } from "vitest";
import { nextOnboardingStep } from "./onboarding-state";

describe("onboarding-state", () => {
  it("sends new users to role first", () => {
    expect(
      nextOnboardingStep({
        role: null,
        canvasDecision: null,
        personaComplete: false,
        hoursComplete: false,
      }),
    ).toBe("role");
  });
  it("requires student Canvas decision before persona", () => {
    expect(
      nextOnboardingStep({
        role: "student",
        canvasDecision: "pending",
        personaComplete: false,
        hoursComplete: false,
      }),
    ).toBe("canvas");
  });
  it("skips Canvas for other role", () => {
    expect(
      nextOnboardingStep({
        role: "other",
        canvasDecision: null,
        personaComplete: false,
        hoursComplete: false,
      }),
    ).toBe("persona");
  });
});
