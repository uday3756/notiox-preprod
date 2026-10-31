-- Fix: duplicate scheduled tasks.
--
-- Root cause: the client auto-schedule effect could run twice (React Strict Mode
-- double-invoke / remount), and autoSaveTask used a non-atomic check-then-insert
-- with no DB constraint, so two concurrent runs both inserted the same task.
--
-- This migration (1) removes any existing duplicate scheduled tasks, keeping the
-- earliest row per (user_id, title, start_time), then (2) adds a UNIQUE index so
-- identical scheduled tasks can never be stored twice again. The client now
-- upserts with onConflict on these columns, turning a racing insert into a no-op.
--
-- Idempotent (safe to re-run): dedupe is a no-op once clean; index uses IF NOT EXISTS.
-- NULL start_time rows (non-timed tasks) are unaffected: NULLs are distinct in a
-- Postgres unique index, so they never collide.

-- 1) De-duplicate existing rows (keep the earliest physical row per identity).
DELETE FROM public.scheduling_nodes a
USING public.scheduling_nodes b
WHERE a.start_time IS NOT NULL
  AND a.user_id = b.user_id
  AND a.title = b.title
  AND a.start_time = b.start_time
  AND a.ctid > b.ctid;

-- 2) Enforce uniqueness going forward. Plain (non-partial) index so PostgREST
--    upsert onConflict inference works; NULL start_time never conflicts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduling_nodes_user_title_start
  ON public.scheduling_nodes (user_id, title, start_time);
