-- App role for Canvas pilot gating (same Notiolive.com app — no separate student domain).
-- student → Canvas connect flow; other → skip; changeable anytime in Profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_role text
    CHECK (app_role IS NULL OR app_role IN ('student', 'other'));

COMMENT ON COLUMN public.profiles.app_role IS
  'Notio app role: student enables Canvas LMS pilot connect; other skips. Editable in Profile.';
