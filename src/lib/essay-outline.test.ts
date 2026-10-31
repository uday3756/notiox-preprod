import { describe, expect, it } from "vitest";
import { ESSAY_OUTLINE_STEPS } from "./essay-outline";

describe("essay outline starter", () => {
  it("provides five independently titled editable steps", () => {
    expect(ESSAY_OUTLINE_STEPS).toHaveLength(5);
    expect(ESSAY_OUTLINE_STEPS.map((s) => s.title)).toEqual([
      "Thesis bullets",
      "Body outline",
      "Draft body paragraphs",
      "Introduction and conclusion",
      "Proofread and export",
    ]);
    for (const step of ESSAY_OUTLINE_STEPS) {
      expect(step.estimate).toBeGreaterThan(0);
    }
  });
});
