import { formatInTimeZone } from "date-fns-tz";
import type { CanvasAssignment, CanvasConnectionState } from "./canvas.types";
const HOUR = 3600000;
export function canvasIdentity(
  item: Pick<CanvasAssignment, "institution" | "courseId" | "assignmentId">,
) {
  return JSON.stringify([item.institution.toLowerCase(), item.courseId, item.assignmentId]);
}
export function canvasDisplayState(item: CanvasAssignment, now = new Date()) {
  const age = item.lastSuccessfulSync
    ? now.getTime() - Date.parse(item.lastSuccessfulSync)
    : Infinity;
  const date = item.personalDueAt ?? item.officialDueAt;
  return {
    stale: age >= 24 * HOUR,
    changed:
      !!item.deadlineChangedAt && now.getTime() - Date.parse(item.deadlineChangedAt) < 48 * HOUR,
    sortLater: !!date && now.getTime() - Date.parse(date) >= 24 * HOUR,
    dateSource: item.personalDueAt ? "You added" : item.officialDueAt ? "Canvas" : "No due date",
    submissionLabel:
      item.submission === "submitted"
        ? "Submitted in Canvas"
        : item.submission === "not_submitted"
          ? "Not submitted in Canvas"
          : "Check Canvas",
  };
}
export function classifyCanvasFailure(status: number): CanvasConnectionState {
  if (status === 401) return "auth_required";
  if (status === 403) return "restricted";
  return "retryable_error";
}
export function canNudge(
  input: {
    enabled: boolean;
    sentToday: number;
    ignored: number;
    snoozedUntil?: string | null;
    notToday?: string | null;
    timezone: string;
  },
  now = new Date(),
) {
  const hour = Number(formatInTimeZone(now, input.timezone, "H"));
  return (
    input.enabled &&
    input.sentToday < 3 &&
    input.ignored < 2 &&
    hour >= 8 &&
    hour < 22 &&
    (!input.snoozedUntil || Date.parse(input.snoozedUntil) <= now.getTime()) &&
    input.notToday !== formatInTimeZone(now, input.timezone, "yyyy-MM-dd")
  );
}
