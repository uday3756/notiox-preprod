-- Feature 2 — Weekly Reflection Report: cache table for generated reports.
--
-- One row per (user, week). The cron job generates the report once per week
-- (per the user's configured weekly_report_day), writes it here, and the
-- in-app card reads from this table. Storing the report (not regenerating on
-- every view) keeps the LLM call count to 1/user/week.
--
-- `content` is the structured JSON the LLM returned (after the tone filter):
--   { wins: string[], completed_count: number, focus_areas: string[],
--     reflection_question: string }
-- `raw_text` is the rendered plain-text version shown in the UI / email.
-- `banned_filtered_count` records how many regenerations the tone filter
-- triggered (0 = clean first pass) — useful for tuning the filter.

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  content JSONB NOT NULL,
  raw_text TEXT NOT NULL,
  banned_filtered_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week
  ON public.weekly_reports(user_id, week_start DESC);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weekly reports"
  ON public.weekly_reports FOR SELECT USING (auth.uid() = user_id);

-- Only the service-role client (cron job) writes reports. Users never insert
-- directly — there's no INSERT/UPDATE/DELETE policy, so RLS denies by default.
