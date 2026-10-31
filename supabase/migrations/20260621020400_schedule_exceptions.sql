-- Create schedule_exceptions table for day-off overrides
CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  exception_date DATE NOT NULL,
  override_start_time TIME,
  override_end_time TIME,
  is_day_off BOOLEAN DEFAULT false,
  reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(user_id, exception_date)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_user_date ON public.schedule_exceptions(user_id, exception_date);

-- Row-level security
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exceptions"
  ON public.schedule_exceptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own exceptions"
  ON public.schedule_exceptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exceptions"
  ON public.schedule_exceptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exceptions"
  ON public.schedule_exceptions
  FOR DELETE
  USING (auth.uid() = user_id);
