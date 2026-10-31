import { describe, it, expect } from "vitest";
import { mondayOf, mondayKeyOf } from "./week";

describe("mondayKeyOf", () => {
  it("maps any day in an ISO week to that week's Monday", () => {
    // Regression: weekly_reports.week_start (rolling, report-day-anchored) almost
    // never equals ef_scores.week_start (strict Monday) on the same date. The
    // live account that surfaced this bug: report week_end 2026-08-19 (Wed) must
    // resolve to the same Monday as the EF score actually stored for that week.
    expect(mondayKeyOf("2026-08-19")).toBe("2026-08-17");
    expect(mondayKeyOf("2026-08-13")).toBe("2026-08-10"); // report's own week_start, different week
  });

  it("is idempotent on a Monday", () => {
    expect(mondayKeyOf("2026-08-17")).toBe("2026-08-17");
  });

  it("wraps correctly across a month boundary", () => {
    expect(mondayKeyOf("2026-09-01")).toBe("2026-08-31"); // Tue Sep 1 -> Mon Aug 31
  });
});

describe("mondayOf", () => {
  it("returns midnight UTC", () => {
    const d = mondayOf("2026-08-19T15:42:00Z");
    expect(d.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });
});
