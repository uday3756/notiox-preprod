import { describe, it, expect } from "vitest";
import { workflowEntry } from "./workflow-onboarding";
const first = { started: false, hasQuiz: false, hasHours: false, hasMap: false, hasTask: false };
describe("short onboarding entry", () => {
  it("welcomes a new user without mandatory setup", () =>
    expect(workflowEntry(first)).toBe("welcome"));
  it("resumes an interrupted first capture", () =>
    expect(workflowEntry({ ...first, started: true })).toBe("resume"));
  it("sends existing and first-save users Home", () => {
    for (const facts of [
      { hasQuiz: true },
      { hasHours: true },
      { hasMap: true },
      { hasTask: true },
    ])
      expect(workflowEntry({ ...first, started: true, ...facts })).toBe("home");
  });
});
