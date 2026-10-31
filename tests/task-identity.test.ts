import { describe, expect, it } from "vitest";
import { logicalDate } from "../src/lib/rings/day";
import { googlePullAllowedFields, voiceUpsertShouldSkip } from "../src/lib/task-identity";

describe("Home scheduled-day identity", () => {
  it("puts tomorrow 9am in Asia/Kolkata on the next calendar day", () => {
    const capturedAt = new Date("2026-11-01T10:00:00+05:30");
    const start = new Date("2026-11-02T09:00:00+05:30");
    expect(logicalDate(capturedAt, "Asia/Kolkata", 4)).toBe("2026-11-01");
    expect(logicalDate(start, "Asia/Kolkata", 4)).toBe("2026-11-02");
  });

  it("does not merge voice upserts onto Canvas rows", () => {
    expect(voiceUpsertShouldSkip("canvas")).toBe(true);
    expect(voiceUpsertShouldSkip("voice")).toBe(false);
  });

  it("lets Google change planned time but not Canvas title", () => {
    expect(googlePullAllowedFields("canvas")).not.toContain("title");
    expect(googlePullAllowedFields("voice")).toContain("title");
  });
});
