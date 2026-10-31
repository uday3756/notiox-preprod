export type CanvasSubmission = "submitted" | "not_submitted" | "unknown";
export type CanvasAssignment = {
  institution: string;
  courseId: string;
  assignmentId: string;
  sourceUrl: string;
  title: string;
  officialDueAt: string | null;
  personalDueAt: string | null;
  submission: CanvasSubmission;
  lastSuccessfulSync: string | null;
  previousOfficialDueAt: string | null;
  deadlineChangedAt: string | null;
};
export type CanvasConnectionState =
  | "disconnected"
  | "syncing"
  | "connected"
  | "retryable_error"
  | "auth_required"
  | "restricted";
export interface CanvasSource {
  getCapabilities(): Promise<{
    pagination: boolean;
    effectiveStudentDates: boolean;
    submissionStatus: boolean;
  }>;
  readAssignmentPage(
    connectionId: string,
    cursor?: string,
  ): Promise<{ items: CanvasAssignment[]; nextCursor?: string }>;
  readSubmissionStatus(connectionId: string, assignmentId: string): Promise<CanvasSubmission>;
  disconnect(connectionId: string): Promise<void>;
}
