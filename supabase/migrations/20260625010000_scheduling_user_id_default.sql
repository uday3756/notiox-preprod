-- Fix: the schedule calendar was always empty because task inserts silently failed.
--
-- scheduling_nodes.user_id and scheduling_logs.user_id are NOT NULL, and the RLS
-- insert policy requires user_id = auth.uid(). The client inserts never set
-- user_id, and there was no column default, so every insert violated NOT NULL +
-- RLS. The error was caught and only logged, so the UI showed no tasks.
--
-- Give user_id a default of auth.uid() (the same pattern node_links already uses)
-- so client inserts fill it automatically and satisfy the RLS check.

ALTER TABLE public.scheduling_nodes ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.scheduling_logs  ALTER COLUMN user_id SET DEFAULT auth.uid();
