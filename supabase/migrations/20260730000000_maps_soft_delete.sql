-- Soft-delete for free-tier map abuse prevention.
-- Free users hide maps (deleted_at set); rows stay so monthly create-count still counts them.
-- Pro / trial hard-delete goes through a server function with service_role.

ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.maps.deleted_at IS
  'When set, map is hidden from the user but still counts toward the free monthly create limit.';

CREATE INDEX IF NOT EXISTS maps_user_active_idx
  ON public.maps (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Stop free users from hard-deleting via the client and resetting their quota.
-- Pro hard-delete and account wipe use service_role (still allowed).
REVOKE DELETE ON public.maps FROM authenticated;
