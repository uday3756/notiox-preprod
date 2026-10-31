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
