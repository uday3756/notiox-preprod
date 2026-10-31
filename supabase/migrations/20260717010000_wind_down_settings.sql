-- Feature 1 + 2 settings — wind-down time + weekly report day.
--
-- Reuses the existing user_working_hours row (one per user) so we don't add a
-- new settings table. All three columns are additive with safe defaults, so
-- existing users get sensible behaviour without a backfill:
--
--   wind_down_hour       INT  DEFAULT 21  (9 PM local)
--   wind_down_minute     INT  DEFAULT 0
--   weekly_report_day    TEXT DEFAULT 'sunday'  (one of mon..sun)
--
-- The wind-down time is in the user's local timezone (the timezone column on
-- the same row), so the client can compute "fire at 21:00 local" without a
-- server round-trip.

ALTER TABLE public.user_working_hours
  ADD COLUMN IF NOT EXISTS wind_down_hour INTEGER NOT NULL DEFAULT 21
    CHECK (wind_down_hour >= 0 AND wind_down_hour <= 23);

ALTER TABLE public.user_working_hours
  ADD COLUMN IF NOT EXISTS wind_down_minute INTEGER NOT NULL DEFAULT 0
    CHECK (wind_down_minute >= 0 AND wind_down_minute <= 59);

ALTER TABLE public.user_working_hours
  ADD COLUMN IF NOT EXISTS weekly_report_day TEXT NOT NULL DEFAULT 'sunday'
    CHECK (weekly_report_day IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday'));
