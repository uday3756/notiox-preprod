-- Persona quiz (post-signup onboarding) — additive only
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS persona_label text;

CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('student', 'founder', 'freelancer')),
  age_bracket text CHECK (
    age_bracket IN ('under_18', '18_24', '25_34', '35_44', '45_54', '55_plus')
  ),
  heard_from text CHECK (
    heard_from IN ('instagram', 'reddit', 'x', 'friend', 'other')
  ),
  motivation_score int CHECK (motivation_score BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.onboarding_responses TO authenticated;
GRANT ALL ON public.onboarding_responses TO service_role;

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user can insert own onboarding row" ON public.onboarding_responses;
CREATE POLICY "user can insert own onboarding row"
  ON public.onboarding_responses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user can read own onboarding row" ON public.onboarding_responses;
CREATE POLICY "user can read own onboarding row"
  ON public.onboarding_responses
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user can update own onboarding row" ON public.onboarding_responses;
CREATE POLICY "user can update own onboarding row"
  ON public.onboarding_responses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
