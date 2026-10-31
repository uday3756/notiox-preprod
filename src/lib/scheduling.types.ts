export type TaskCategory =
  | "meeting"
  | "deadline"
  | "standup"
  | "presentation"
  | "deep-work"
  | "break"
  | "lunch"
  | "admin"
  | "planning"
  | "exercise"
  | "personal"
  | "task";

export type TimeExtractionResult = {
  title: string;
  category: TaskCategory;
  start_time_iso: string | null;
  end_time_iso: string | null;
  estimated_duration_minutes: number;
  is_timebound: boolean;
  confidence: number;
  interpretation: string;
  requires_confirmation: boolean;
  fallback_times?: { time: string; reason: string }[];
  timezone_assumed: string;
};

/** Persisted scheduling_nodes row — not the AI extraction schema. */
export type PersistedTaskSource = "voice" | "capture" | "journal" | "manual" | "canvas" | "google" | string;

export type PersistedTask = {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  due_at?: string | null;
  is_timebound: boolean | null;
  category: string | null;
  status: "pending" | "in_progress" | "completed" | "deferred" | string;
  source?: PersistedTaskSource | null;
  revision?: number;
  tombstone?: boolean | null;
  extracted_intent?: unknown;
  estimated_duration_minutes?: number | null;
  location?: string | null;
  attendees?: string[] | null;
};

export interface ScheduleConstraint {
  status: "valid" | "conflict" | "outside_hours";
  violations: string[];
  suggestions: {
    earliest_valid_slot?: string;
    alternative_dates?: string[];
  };
}
