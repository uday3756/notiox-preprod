import { describe, expect, it } from "vitest";
import { levelForXp, progressForXp, rewardTransition } from "./dolphin-progression";
import { completionCommand } from "./task-completion.types";

describe("approved reward policy", () => {
  it("uses level one at zero and exact 100 XP boundaries", () => {
    expect([0, 99, 100, 200, -10, NaN].map(levelForXp)).toEqual([1, 1, 2, 3, 1, 1]);
    expect(progressForXp(110)).toEqual({
      confirmedXp: 110,
      pendingXp: 0,
      level: 2,
      intoLevel: 10,
      nextAt: 100,
    });
    expect(progressForXp(110, 10).pendingXp).toBe(10);
  });
  it("awards once, reverses on undo and restores on recompletion", () => {
    expect(rewardTransition(false, true, true).delta).toBe(10);
    expect(rewardTransition(true, true, true).delta).toBe(0);
    expect(rewardTransition(true, false, true).delta).toBe(-10);
    expect(rewardTransition(false, true, true).delta).toBe(10);
    expect(rewardTransition(false, true, false).delta).toBe(0);
  });
  it("rejects client reward amounts and invalid revisions", () => {
    const input = {
      entityId: crypto.randomUUID(),
      actionId: crypto.randomUUID(),
      desiredState: true,
      expectedRevision: 0,
      source: "home",
      xp: 500,
    };
    expect(completionCommand.parse(input)).not.toHaveProperty("xp");
    expect(completionCommand.safeParse({ ...input, expectedRevision: -1 }).success).toBe(false);
  });
});
