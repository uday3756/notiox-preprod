// Client-safe support constants (no server imports) shared by the form,
// list, and details pages.

export const TICKET_TYPES = [
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "technical_issue", label: "Technical Issue" },
  { value: "billing", label: "Billing" },
  { value: "account_issue", label: "Account Issue" },
  { value: "other", label: "Other" },
] as const;

export type TicketType = (typeof TICKET_TYPES)[number]["value"];

export const ticketTypeLabel = (v: string): string =>
  TICKET_TYPES.find((t) => t.value === v)?.label ?? "Other";

type Tone = "info" | "warning" | "success" | "default";

export const TICKET_STATUSES: { value: string; label: string; tone: Tone }[] = [
  { value: "open", label: "Open", tone: "info" },
  { value: "in_progress", label: "In Progress", tone: "warning" },
  { value: "waiting_user", label: "Waiting for User", tone: "warning" },
  { value: "resolved", label: "Resolved", tone: "success" },
  { value: "closed", label: "Closed", tone: "default" },
  { value: "pending", label: "Pending", tone: "warning" },
];

export const statusLabel = (v: string): string =>
  TICKET_STATUSES.find((s) => s.value === v)?.label ?? v;

export const statusTone = (v: string): Tone =>
  TICKET_STATUSES.find((s) => s.value === v)?.tone ?? "default";

/** Tailwind classes for a status pill, matching the app's token palette. */
export const statusPillClass = (v: string): string => {
  switch (statusTone(v)) {
    case "success":
      return "bg-emerald-500/15 text-emerald-400";
    case "warning":
      return "bg-amber-500/15 text-amber-400";
    case "info":
      return "bg-primary/15 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export type SupportTicket = {
  id: string;
  ticket_id: string | null;
  ticket_type: string | null;
  subject: string;
  body: string;
  screenshot_url: string | null;
  status: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
};
