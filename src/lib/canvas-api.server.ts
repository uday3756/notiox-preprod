import type {
  CanvasAssignment,
  CanvasConnectionState,
  CanvasSource,
  CanvasSubmission,
} from "./canvas.types";
import { canvasIdentity, classifyCanvasFailure } from "./canvas-policy";

type StoredConnection = {
  id: string;
  domain: string;
  token: string;
  institution: string;
  generation: number;
};

function normalizeDomain(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function mapSubmission(raw: unknown): CanvasSubmission {
  if (!raw || typeof raw !== "object") return "unknown";
  const workflow = (raw as { workflow_state?: string }).workflow_state;
  if (workflow === "submitted" || workflow === "graded") return "submitted";
  if (workflow === "unsubmitted") return "not_submitted";
  return "unknown";
}

async function canvasFetch(
  connection: StoredConnection,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `https://${connection.domain}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  const host = new URL(url).host.toLowerCase();
  if (host !== connection.domain && !host.endsWith(`.${connection.domain}`)) {
    throw Object.assign(new Error("Refusing to follow off-host Canvas URL"), { status: 400 });
  }
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${connection.token}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function parseLinkNext(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.split(",").map((p) => p.trim()).find((p) => p.includes('rel="next"'));
  if (!match) return undefined;
  const url = match.match(/<([^>]+)>/);
  return url?.[1];
}

export function createDirectCanvasSource(getConnection: (id: string) => Promise<StoredConnection>): CanvasSource {
  return {
    async getCapabilities() {
      return { pagination: true, effectiveStudentDates: true, submissionStatus: true };
    },
    async readAssignmentPage(connectionId, cursor) {
      const connection = await getConnection(connectionId);
      const path =
        cursor ??
        `/users/self/courses?enrollment_state=active&per_page=50&include[]=term`;
      // First call lists courses; subsequent cursors may be assignment pages.
      if (!cursor || cursor.includes("/courses?")) {
        const coursesRes = await canvasFetch(connection, path);
        if (!coursesRes.ok) {
          throw Object.assign(new Error("Canvas course list failed"), {
            status: coursesRes.status,
          });
        }
        const courses = (await coursesRes.json()) as Array<{ id: number | string; name?: string }>;
        const items: CanvasAssignment[] = [];
        for (const course of courses.slice(0, 20)) {
          const assignRes = await canvasFetch(
            connection,
            `/courses/${course.id}/assignments?per_page=50&order_by=due_at&include[]=submission`,
          );
          if (!assignRes.ok) continue;
          const assignments = (await assignRes.json()) as Array<{
            id: number | string;
            name: string;
            html_url?: string;
            due_at?: string | null;
            submission?: unknown;
          }>;
          for (const a of assignments) {
            items.push({
              institution: connection.institution,
              courseId: String(course.id),
              assignmentId: String(a.id),
              sourceUrl:
                a.html_url ??
                `https://${connection.domain}/courses/${course.id}/assignments/${a.id}`,
              title: a.name,
              officialDueAt: a.due_at ?? null,
              personalDueAt: null,
              submission: mapSubmission(a.submission),
              lastSuccessfulSync: new Date().toISOString(),
              previousOfficialDueAt: null,
              deadlineChangedAt: null,
            });
          }
        }
        const next = parseLinkNext(coursesRes.headers.get("link"));
        return { items, nextCursor: next };
      }
      const res = await canvasFetch(connection, cursor);
      if (!res.ok) throw Object.assign(new Error("Canvas page failed"), { status: res.status });
      const assignments = (await res.json()) as Array<{
        id: number | string;
        name: string;
        html_url?: string;
        due_at?: string | null;
        course_id?: number | string;
        submission?: unknown;
      }>;
      return {
        items: assignments.map((a) => ({
          institution: connection.institution,
          courseId: String(a.course_id ?? ""),
          assignmentId: String(a.id),
          sourceUrl: a.html_url ?? `https://${connection.domain}/assignments/${a.id}`,
          title: a.name,
          officialDueAt: a.due_at ?? null,
          personalDueAt: null,
          submission: mapSubmission(a.submission),
          lastSuccessfulSync: new Date().toISOString(),
          previousOfficialDueAt: null,
          deadlineChangedAt: null,
        })),
        nextCursor: parseLinkNext(res.headers.get("link")),
      };
    },
    async readSubmissionStatus(connectionId, assignmentId) {
      const connection = await getConnection(connectionId);
      // assignmentId here is expected as courseId:assignmentId for direct lookups.
      const [courseId, id] = assignmentId.split(":");
      if (!courseId || !id) return "unknown";
      const res = await canvasFetch(
        connection,
        `/courses/${courseId}/assignments/${id}/submissions/self`,
      );
      if (res.status === 401 || res.status === 403) return "unknown";
      if (!res.ok) return "unknown";
      return mapSubmission(await res.json());
    },
    async disconnect() {
      /* persistence handled by caller */
    },
  };
}

export { normalizeDomain, canvasIdentity, classifyCanvasFailure };
export type { StoredConnection, CanvasConnectionState };
