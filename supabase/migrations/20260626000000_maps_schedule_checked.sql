-- Token-saving flag: mark a map once its transcript has been run through the
-- schedule extractor. Without this, maps with NO time-bound content never save
-- a scheduling row, so the "already scheduled?" guard never trips and the AI
-- extractor re-runs on every open - burning tokens to find nothing each time.
--
-- Set true after the first extraction attempt (regardless of result); the client
-- then skips extraction on every subsequent open.

ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS schedule_checked boolean NOT NULL DEFAULT false;
