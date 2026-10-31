import { describe, expect, it } from "vitest";
import { formatReportRange, selectDisplayReports } from "./weekly-report-display";

const report = (id: string, start = "2026-10-17", end = "2026-10-23", created = "2026-10-23T10:00:00Z") => ({
  id, week_start: start, week_end: end, created_at: created,
  content: { wins: [], completed_count: 0, reflection_question: "What is one next step?" },
});

describe("weekly report display selection", () => {
  it("handles empty data and a single report", () => {
    expect(selectDisplayReports([])).toEqual([]);
    const only = report("only");
    expect(selectDisplayReports([only])).toEqual([only]);
  });

  it("removes repeated IDs without changing the source array or objects", () => {
    const first = Object.freeze(report("same"));
    const source = Object.freeze([first, first]);
    expect(selectDisplayReports(source)).toEqual([first]);
    expect(source).toHaveLength(2);
  });

  it("selects the newest version of an identical period in its original position", () => {
    const older = report("older");
    const historical = report("history", "2026-10-10", "2026-10-16");
    const newer = report("newer", undefined, undefined, "2026-10-23T12:00:00Z");
    expect(selectDisplayReports([older, historical, newer])).toEqual([newer, historical]);
  });

  it("keeps response order for equal timestamps", () => {
    const first = report("first");
    expect(selectDisplayReports([first, report("second")])).toEqual([first]);
  });

  it("keeps identical zero-activity content for different and overlapping periods", () => {
    const first = report("first");
    const overlap = report("overlap", "2026-10-16", "2026-10-22");
    const previous = report("previous", "2026-10-10", "2026-10-16");
    expect(selectDisplayReports([first, overlap, previous])).toEqual([first, overlap, previous]);
  });

  it("does not add another visible period when regeneration updates the response", () => {
    const first = report("latest");
    const regenerated = { ...first, content: { ...first.content, completed_count: 3 } };
    expect(selectDisplayReports([regenerated, report("other-copy")])).toEqual([regenerated]);
  });
});

describe("report date labels", () => {
  it("formats a same-year period", () => {
    expect(formatReportRange("2026-10-17", "2026-10-23")).toBe("Oct 17 - Oct 23, 2026");
  });

  it("includes both years across a year boundary", () => {
    expect(formatReportRange("2025-12-29", "2026-01-04")).toBe("Dec 29, 2025 - Jan 4, 2026");
  });
});
