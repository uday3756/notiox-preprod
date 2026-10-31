-- Auth-time promo / referral tracking (mirrors remote migration)
CREATE TABLE IF NOT EXISTS public.referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  code_kind text NOT NULL CHECK (code_kind IN ('referral', 'promo')),
  referral_code_id uuid REFERENCES public.referral_codes(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  referrer_name text NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  premium_plan text CHECK (premium_plan IS NULL OR premium_plan IN ('pro-monthly', 'pro-annual', 'founders')),
  premium_purchased_at timestamptz,
  CONSTRAINT referral_attributions_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS referral_attributions_doctor_idx
  ON public.referral_attributions (doctor_id, attributed_at DESC);
CREATE INDEX IF NOT EXISTS referral_attributions_code_idx
  ON public.referral_attributions (lower(code));

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own referral attribution" ON public.referral_attributions;
CREATE POLICY "user reads own referral attribution"
  ON public.referral_attributions FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

REVOKE ALL ON TABLE public.referral_attributions FROM anon, authenticated;
GRANT SELECT ON TABLE public.referral_attributions TO authenticated;
GRANT ALL ON TABLE public.referral_attributions TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by_name text,
  ADD COLUMN IF NOT EXISTS referral_code_used text,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz;
