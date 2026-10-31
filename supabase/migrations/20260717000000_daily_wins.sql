-- Feature 1 (3 Wins) — daily_wins table.
--
-- Stores the 0-3 wins a user records at the end of each day. One row per win
-- (so a day can have up to 3 rows). `date` is the user's LOCAL date (not UTC)
-- because the wind-down ritual is anchored to the user's evening — a win
-- recorded at 11 PM IST on Jul 17 belongs to Jul 17, not Jul 18 UTC.
--
-- `source` is 'task' when the win was tapped from today's completed tasks
-- (task_id set) or 'manual' when the user typed/spoke it free-text (task_id
-- null). RLS-scoped to the owner like every other table.

CREATE TABLE IF NOT EXISTS public.daily_wins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Local date in the user's timezone (YYYY-MM-DD). Stored as DATE not TSTZ so
  -- grouping by day is timezone-independent and stable across DST changes.
  local_date DATE NOT NULL,
  win_text TEXT NOT NULL,
  -- 'task' = tapped from a completed scheduling_node; 'manual' = free-text/voice.
  source TEXT NOT NULL DEFAULT 'manual',
  task_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- One win per (user, day, text) — prevents dupes if the same completed task
  -- is tapped twice. Multiple distinct wins per day are still allowed.
  CONSTRAINT unique_win_per_day UNIQUE (user_id, local_date, win_text),
  CONSTRAINT valid_source CHECK (source IN ('task', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_daily_wins_user_date ON public.daily_wins(user_id, local_date);
CREATE INDEX IF NOT EXISTS idx_daily_wins_user_created ON public.daily_wins(user_id, created_at);

ALTER TABLE public.daily_wins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily wins"
  ON public.daily_wins FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily wins"
  ON public.daily_wins FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily wins"
  ON public.daily_wins FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily wins"
  ON public.daily_wins FOR DELETE USING (auth.uid() = user_id);
