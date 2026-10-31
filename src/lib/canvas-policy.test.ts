import { describe, expect, it } from "vitest";
import {
  canvasDisplayState,
  canvasIdentity,
  classifyCanvasFailure,
  canNudge,
} from "./canvas-policy";
import type { CanvasAssignment } from "./canvas.types";
const item: CanvasAssignment = {
  institution: "school.instructure.com",
  courseId: "1",
  assignmentId: "2",
  sourceUrl: "https://school.instructure.com/courses/1/assignments/2",
  title: "Essay",
  officialDueAt: null,
  personalDueAt: null,
  submission: "unknown",
  lastSuccessfulSync: null,
  previousOfficialDueAt: null,
  deadlineChangedAt: null,
};
describe("Canvas transport-neutral policy", () => {
  it("does not invent dates or submission evidence", () => {
    const state = canvasDisplayState(item);
    expect(state.stale).toBe(true);
    expect(state.sortLater).toBe(false);
    expect(state.dateSource).toBe("No due date");
    expect(state.submissionLabel).toBe("Check Canvas");
  });
  it("keeps stable identity despite title and deadline changes", () => {
    const changed = { ...item, title: "Changed", officialDueAt: "2026-10-23" };
    expect(canvasIdentity(item)).toBe(canvasIdentity(changed));
  });
  it("uses 24h stale/Sort later and 48h changed boundaries", () => {
    const value = {
      ...item,
      lastSuccessfulSync: "2026-10-22T12:00:00Z",
      officialDueAt: "2026-10-22T12:00:00Z",
      deadlineChangedAt: "2026-10-21T12:00:00Z",
    };
    const state = canvasDisplayState(value, new Date("2026-10-23T12:00:00Z"));
    expect(state.stale).toBe(true);
    expect(state.sortLater).toBe(true);
    expect(state.changed).toBe(false);
  });
  it("keeps terminal auth and permission failures separate", () => {
    expect(classifyCanvasFailure(401)).toBe("auth_required");
    expect(classifyCanvasFailure(403)).toBe("restricted");
    expect(classifyCanvasFailure(429)).toBe("retryable_error");
  });
  it("honors opt-in, caps, quiet hours, snooze and ignored nudges", () => {
    const settings = { enabled: true, sentToday: 0, ignored: 0, timezone: "Asia/Kolkata" };
    const now = new Date("2026-10-23T05:00:00Z");
    expect(canNudge(settings, now)).toBe(true);
    for (const change of [
      { enabled: false },
      { sentToday: 3 },
      { ignored: 2 },
      { snoozedUntil: "2026-10-24T00:00:00Z" },
      { notToday: "2026-10-23" },
    ])
      expect(canNudge({ ...settings, ...change }, now)).toBe(false);
    expect(canNudge(settings, new Date("2026-10-23T17:00:00Z"))).toBe(false);
  });
});
