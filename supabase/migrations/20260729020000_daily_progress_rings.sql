-- Daily Progress Rings (Julian handoff)
-- Map handoff "tasks" -> nodes; "user_settings" -> user_working_hours

ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS time_block text
    CHECK (time_block IS NULL OR time_block IN ('morning','afternoon','evening')),
  ADD COLUMN IF NOT EXISTS time_block_source text
    CHECK (time_block_source IS NULL OR time_block_source IN ('explicit','inferred','default','user_corrected')),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS logical_date date;

CREATE INDEX IF NOT EXISTS nodes_user_logical_date_idx
  ON public.nodes (user_id, logical_date)
  WHERE done = true AND parent_id IS NOT NULL;

ALTER TABLE public.user_working_hours
  ADD COLUMN IF NOT EXISTS day_start_hour smallint NOT NULL DEFAULT 4
    CHECK (day_start_hour >= 0 AND day_start_hour <= 23),
  ADD COLUMN IF NOT EXISTS block_boundaries jsonb NOT NULL DEFAULT '{"morning":[4,12],"afternoon":[12,17],"evening":[17,4]}'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_task_estimate smallint NOT NULL DEFAULT 10
    CHECK (daily_task_estimate >= 3 AND daily_task_estimate <= 20),
  ADD COLUMN IF NOT EXISTS rings_celebrated_on date;
