import { describe, it, expect } from "vitest";
import {
  computePillars, computeComposite, applyDeclineCap, deriveArchetype, scoreWeek, lowestPillar,
} from "./score";
import type { WeekAggregates } from "./types";

const agg = (o: Partial<WeekAggregates> = {}): WeekAggregates => ({
  activeDays: 4, daysWithWins: 3, eveningWinDays: 2,
  mapsCreated: 5, avgBranchesPerMap: 6, tasksCompleted: 17, ...o,
});

describe("computePillars", () => {
  it("scores simplicity 100 at or under six branches", () => {
    expect(computePillars(agg({ avgBranchesPerMap: 6 })).simplicity).toBe(100);
    expect(computePillars(agg({ avgBranchesPerMap: 4 })).simplicity).toBe(100);
  });

  it("penalises branch sprawl", () => {
    expect(computePillars(agg({ avgBranchesPerMap: 11 })).simplicity).toBe(40);
  });

  it("normalises wins and wind-down over ACTIVE days, not 7", () => {
    // Handoff §8: a deliberate day off must not lower the score.
    const p = computePillars(agg({ activeDays: 4, daysWithWins: 4, eveningWinDays: 2 }));
    expect(p.wins).toBe(100);
    expect(p.winddown).toBe(50);
  });

  it("leaves initiation null at scoring version 1", () => {
    expect(computePillars(agg()).initiation).toBeNull();
  });

  it("is safe on a zero-activity week", () => {
    const p = computePillars(agg({
      activeDays: 0, daysWithWins: 0, eveningWinDays: 0, mapsCreated: 0, avgBranchesPerMap: null,
    }));
    expect(p.wins).toBe(0);
    expect(p.winddown).toBe(0);
    expect(p.simplicity).toBe(50);
  });
});

describe("computeComposite", () => {
  it("averages only non-null pillars", () => {
    expect(computeComposite({ initiation: null, simplicity: 100, wins: 75, winddown: 50 })).toBe(75);
  });

  it("ignores a null-only pillar set", () => {
    expect(computeComposite({ initiation: null, simplicity: 0, wins: 0, winddown: 0 })).toBe(0);
  });
});

describe("applyDeclineCap", () => {
  it("caps a drop at 5 points", () => {
    expect(applyDeclineCap(50, 68)).toBe(63);
  });
  it("does not cap increases", () => {
    expect(applyDeclineCap(90, 60)).toBe(90);
  });
  it("passes through on the first week", () => {
    expect(applyDeclineCap(72, null)).toBe(72);
  });
  it("leaves a small dip untouched", () => {
    expect(applyDeclineCap(65, 68)).toBe(65);
  });
});

describe("deriveArchetype", () => {
  it("is stable for the same pillar shape", () => {
    const p = { initiation: null, simplicity: 52, wins: 81, winddown: 63 };
    expect(deriveArchetype(p)).toBe(deriveArchetype(p));
    expect(deriveArchetype(p)).toBe("Steady Builder"); // highest wins, lowest simplicity
  });
  it("falls back before two pillars exist", () => {
    expect(deriveArchetype({ initiation: null, simplicity: null as never, wins: null as never, winddown: 40 }))
      .toBe("Getting Started");
  });
});

describe("lowestPillar", () => {
  it("returns the weakest scored pillar", () => {
    expect(lowestPillar({ initiation: null, simplicity: 52, wins: 81, winddown: 63 })).toBe("simplicity");
  });
});

describe("scoreWeek", () => {
  it("is deterministic — same input, same output", () => {
    // Acceptance criterion: score does not change between Sunday recomputes.
    const a = agg();
    expect(scoreWeek(a, 60)).toEqual(scoreWeek(a, 60));
  });

  it("produces a healthy mid-range score for a realistic active week", () => {
    // Handoff mock shape: "Days active 4/7 · Wins 9 · Tasks 17".
    const r = scoreWeek(agg({
      activeDays: 4, daysWithWins: 3, eveningWinDays: 3,
      mapsCreated: 5, avgBranchesPerMap: 7, tasksCompleted: 17,
    }), null);
    expect(r.composite).toBeGreaterThan(55);
    expect(r.composite).toBeLessThan(90);
    // simplicity highest (88) / wins lowest (75) -> the "Clear Thinker" label.
    expect(r.archetype).toBe("Clear Thinker");
  });

  it("labels a wins-strongest, sprawling-maps week as Steady Builder", () => {
    const r = scoreWeek(agg({
      activeDays: 4, daysWithWins: 4, eveningWinDays: 3,
      mapsCreated: 5, avgBranchesPerMap: 10, tasksCompleted: 17,
    }), null);
    expect(r.archetype).toBe("Steady Builder"); // highest wins, lowest simplicity
  });

  it("scores an empty week low — which is why compute carries the prior score forward instead", () => {
    // Regression guard. A zero-activity week scores ~17/100 under the raw
    // formula, which would be a punitive signal for someone who simply took the
    // week off. computeEfForUser never writes this raw value directly — it
    // carries the previous week's score forward unchanged (or shows a genuine 0
    // on a true first week), per the handoff's "do not hide the widget" rule.
    // This test documents WHY the raw formula alone isn't used for that case.
    const empty = scoreWeek(agg({
      activeDays: 0, daysWithWins: 0, eveningWinDays: 0,
      mapsCreated: 0, avgBranchesPerMap: null, tasksCompleted: 0,
    }), null);
    expect(empty.composite).toBeLessThan(25);
  });

  it("produces a composite in range with an archetype label", () => {
    const r = scoreWeek(agg(), null);
    expect(r.composite).toBeGreaterThanOrEqual(0);
    expect(r.composite).toBeLessThanOrEqual(100);
    expect(typeof r.archetype).toBe("string");
  });
});
