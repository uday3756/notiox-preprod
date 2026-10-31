-- Track completion for the to-do list view.
ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false;
