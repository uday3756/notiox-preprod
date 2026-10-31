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
