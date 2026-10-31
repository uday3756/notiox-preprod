ALTER TABLE public.nodes ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 1;
-- 0 = none, 1 = low, 2 = medium, 3 = high
COMMENT ON COLUMN public.nodes.priority IS '0=none, 1=low, 2=medium, 3=high. Set by AI on creation; editable by the user.';