-- Create user_working_hours table for scheduling constraints
CREATE TABLE IF NOT EXISTS public.user_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Working hours per day (stored as TIME, not TIMESTAMP)
  monday_start TIME DEFAULT '09:00:00',
  monday_end TIME DEFAULT '17:00:00',
  tuesday_start TIME DEFAULT '09:00:00',
  tuesday_end TIME DEFAULT '17:00:00',
  wednesday_start TIME DEFAULT '09:00:00',
  wednesday_end TIME DEFAULT '17:00:00',
  thursday_start TIME DEFAULT '09:00:00',
  thursday_end TIME DEFAULT '17:00:00',
  friday_start TIME DEFAULT '09:00:00',
  friday_end TIME DEFAULT '17:00:00',
  saturday_start TIME,
  saturday_end TIME,
  sunday_start TIME,
  sunday_end TIME,

  -- Preferences
  timezone TEXT NOT NULL DEFAULT 'UTC',
  break_start_time TIME DEFAULT '12:00:00',
  break_duration_minutes INTEGER DEFAULT 60,

  -- Constraints
  min_focus_block_minutes INTEGER DEFAULT 30,
  max_daily_hours INTEGER DEFAULT 8,
  protect_evenings BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT valid_break_duration CHECK (break_duration_minutes > 0),
  CONSTRAINT valid_min_focus CHECK (min_focus_block_minutes > 0),
  CONSTRAINT valid_max_daily_hours CHECK (max_daily_hours > 0)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_user_working_hours_user_id ON public.user_working_hours(user_id);

-- Row-level security
ALTER TABLE public.user_working_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own working hours"
  ON public.user_working_hours
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own working hours"
  ON public.user_working_hours
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their working hours"
  ON public.user_working_hours
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
