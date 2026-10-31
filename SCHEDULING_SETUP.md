# Time-Bound Scheduling System - Setup Guide

## Step 1: Apply Database Migrations to Supabase

Go to **Supabase Dashboard → SQL Editor** and run these queries in order:

### Migration 1: scheduling_nodes table
```sql
-- Create scheduling_nodes table for time-bound tasks
CREATE TABLE IF NOT EXISTS public.scheduling_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_node_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE CASCADE,

  -- Core node data
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'deferred')),
  priority INTEGER DEFAULT 3,
  CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 5),

  -- Time-binding fields
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  is_timebound BOOLEAN DEFAULT false,
  category TEXT DEFAULT 'task',
  CONSTRAINT valid_category CHECK (category IN ('meeting', 'deadline', 'standup', 'presentation', 'deep-work', 'break', 'lunch', 'admin', 'planning', 'exercise', 'personal', 'task')),

  -- Duration tracking
  estimated_duration_minutes INTEGER,
  actual_duration_minutes INTEGER,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- AI metadata
  extracted_intent JSONB,
  original_transcript TEXT,

  CONSTRAINT valid_time_range CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time),
  CONSTRAINT valid_duration CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),
  CONSTRAINT valid_actual_duration CHECK (actual_duration_minutes IS NULL OR actual_duration_minutes > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_user_id ON public.scheduling_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_start_time ON public.scheduling_nodes(start_time);
CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_user_status ON public.scheduling_nodes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_category ON public.scheduling_nodes(category);
CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_parent ON public.scheduling_nodes(parent_node_id);

-- Row-level security
ALTER TABLE public.scheduling_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scheduling nodes"
  ON public.scheduling_nodes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduling nodes"
  ON public.scheduling_nodes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduling nodes"
  ON public.scheduling_nodes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduling nodes"
  ON public.scheduling_nodes
  FOR DELETE
  USING (auth.uid() = user_id);
```

### Migration 2: user_working_hours table
```sql
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
```

### Migration 3: task_analytics table
```sql
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
```

### Migration 4: scheduling_logs table
```sql
-- Create scheduling_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.scheduling_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE SET NULL,

  -- Log metadata
  action TEXT NOT NULL,
  CONSTRAINT valid_action CHECK (action IN ('created', 'rescheduled', 'postponed', 'completed', 'marked_done', 'conflict_detected', 'updated', 'deleted')),
  source TEXT NOT NULL,
  CONSTRAINT valid_source CHECK (source IN ('voice_input', 'manual_input', 'adaptive_reschedule', 'conflict_resolution', 'api')),

  -- Details
  old_start_time TIMESTAMP WITH TIME ZONE,
  new_start_time TIMESTAMP WITH TIME ZONE,
  old_duration_minutes INTEGER,
  new_duration_minutes INTEGER,

  reason TEXT,
  ai_decision_metadata JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT valid_change CHECK (
    action != 'rescheduled' OR (old_start_time IS NOT NULL AND new_start_time IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduling_logs_user_id ON public.scheduling_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_logs_action ON public.scheduling_logs(action);
CREATE INDEX IF NOT EXISTS idx_scheduling_logs_created_at ON public.scheduling_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduling_logs_node_id ON public.scheduling_logs(node_id);

-- Row-level security
ALTER TABLE public.scheduling_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs"
  ON public.scheduling_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert logs"
  ON public.scheduling_logs
  FOR INSERT
  WITH CHECK (true);
```

### Migration 5: schedule_exceptions table
```sql
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
```

---

## Step 2: Verify Migrations in Supabase

After running all migrations in SQL Editor, verify tables exist:
- Go to **Table Editor** and confirm you see:
  - `scheduling_nodes`
  - `user_working_hours`
  - `task_analytics`
  - `scheduling_logs`
  - `schedule_exceptions`

---

## Implementation Status

✅ **Backend Ready:**
- All migrations created
- Claude timestamp extraction API (`src/lib/scheduling.functions.ts`)
- Working hours validation logic
- Audit logging system

✅ **UI Components Built:**
- `VoiceCaptureDialog` — voice/text input
- `ScheduleConfirmationDialog` — confirm extracted tasks
- `WorkingHoursSetup` — onboarding flow
- `TimelineView` — calendar view

⏳ **Next: Wire into App Routes**
- Create scheduling page route
- Integrate with auth flow
- Connect components to server functions
