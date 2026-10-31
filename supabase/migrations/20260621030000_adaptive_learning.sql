-- Phase 3: Adaptive Learning tables

-- Adaptive patterns: aggregate behavior per user
CREATE TABLE IF NOT EXISTS public.adaptive_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  total_tasks_completed INTEGER DEFAULT 0,
  completion_rate DECIMAL(5, 2) DEFAULT 0,
  tasks_on_time INTEGER DEFAULT 0,
  tasks_late INTEGER DEFAULT 0,

  estimation_accuracy_ratio DECIMAL(5, 2) DEFAULT 1.0,
  category_accuracy JSONB DEFAULT '{}',

  postponement_frequency DECIMAL(5, 2) DEFAULT 0,
  categories_postponed JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Hourly performance snapshots
CREATE TABLE IF NOT EXISTS public.hourly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),

  productivity_score DECIMAL(3, 2) DEFAULT 0.5,
  completion_rate DECIMAL(5, 2) DEFAULT 0,
  task_count INTEGER DEFAULT 0,

  date DATE NOT NULL,
  energy_level TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, hour_of_day, date)
);

-- Smart recommendations
CREATE TABLE IF NOT EXISTS public.smart_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  recommendation_type TEXT NOT NULL,
  category TEXT,

  data JSONB NOT NULL,
  confidence DECIMAL(3, 2) DEFAULT 0.5,

  was_applied BOOLEAN DEFAULT false,
  was_helpful BOOLEAN,
  is_dismissed BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Daily energy snapshot (fatigue detection)
CREATE TABLE IF NOT EXISTS public.daily_energy_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  date DATE NOT NULL,

  morning_productivity DECIMAL(3, 2),
  afternoon_productivity DECIMAL(3, 2),
  evening_productivity DECIMAL(3, 2),

  postponement_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  average_task_duration_ratio DECIMAL(3, 2),

  likely_energy_level TEXT,
  recommended_breaks INTEGER DEFAULT 2,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_adaptive_patterns_user ON public.adaptive_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_hourly_performance_user_date ON public.hourly_performance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_energy_user_date ON public.daily_energy_snapshot(user_id, date);
CREATE INDEX IF NOT EXISTS idx_smart_recommendations_user ON public.smart_recommendations(user_id);

-- RLS
ALTER TABLE public.adaptive_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_energy_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own adaptive patterns" ON public.adaptive_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own adaptive patterns" ON public.adaptive_patterns FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service insert adaptive patterns" ON public.adaptive_patterns FOR INSERT WITH CHECK (true);

CREATE POLICY "Users see own hourly performance" ON public.hourly_performance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service insert hourly performance" ON public.hourly_performance FOR INSERT WITH CHECK (true);

CREATE POLICY "Users see own recommendations" ON public.smart_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own recommendations" ON public.smart_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service insert recommendations" ON public.smart_recommendations FOR INSERT WITH CHECK (true);

CREATE POLICY "Users see own energy snapshots" ON public.daily_energy_snapshot FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service insert energy snapshots" ON public.daily_energy_snapshot FOR INSERT WITH CHECK (true);
