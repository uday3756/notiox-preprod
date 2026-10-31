-- Add reminder_sent_at column to scheduling_nodes
ALTER TABLE public.scheduling_nodes 
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- Create an index for querying pending reminders efficiently
CREATE INDEX IF NOT EXISTS idx_scheduling_nodes_reminder 
ON public.scheduling_nodes(start_time) 
WHERE reminder_sent_at IS NULL AND status = 'pending';
