-- Create task_analytics table for behavior tracking
CREATE TABLE IF NOT EXISTS public.task_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Completion metrics
  total_tasks_created INTEGER DEFAULT 0,
  total_tasks_completed INTEGER DEFAULT 0,
  completion_rate DECIMAL(5, 2) DEFAULT 0,

  -- Time estimation accuracy
  total_estimated_minutes INTEGER DEFAULT 0,
  total_actual_minutes INTEGER DEFAULT 0,
  estimation_accuracy_ratio DECIMAL(5, 2) DEFAULT 0,
  time_underestimation_percent DECIMAL(5, 2) DEFAULT 0,

  -- Behavior patterns
  postponement_count INTEGER DEFAULT 0,
  last_postponement_at TIMESTAMP WITH TIME ZONE,
  completion_streak_days INTEGER DEFAULT 0,

  -- Category-specific metrics (JSON)
  category_completion_rates JSONB DEFAULT '{}',

  -- Energy patterns
  best_performing_hour INTEGER,
  worst_performing_hour INTEGER,
  energy_dips_by_hour JSONB DEFAULT '{}',

  -- Weekly patterns
  most_productive_day TEXT,
  least_productive_day TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_learning_update TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_hour CHECK (best_performing_hour IS NULL OR (best_performing_hour >= 0 AND best_performing_hour <= 23)),
  CONSTRAINT valid_worst_hour CHECK (worst_performing_hour IS NULL OR (worst_performing_hour >= 0 AND worst_performing_hour <= 23))
);

-- Index
CREATE INDEX IF NOT EXISTS idx_task_analytics_user_id ON public.task_analytics(user_id);

-- Row-level security
ALTER TABLE public.task_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analytics"
  ON public.task_analytics
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own analytics"
  ON public.task_analytics
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can insert analytics"
  ON public.task_analytics
  FOR INSERT
  WITH CHECK (true);
