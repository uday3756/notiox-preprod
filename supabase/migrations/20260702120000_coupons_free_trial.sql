-- Coupon codes + free-trial redemption system.
-- Additive only: new tables + one SECURITY DEFINER function. Reuses the existing
-- `subscriptions` table to grant premium (plan='pro', status='trialing') so the
-- existing readPlan() gate unlocks premium automatically for trial users.

-- 1. Coupons catalogue -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  type            text NOT NULL DEFAULT 'free_trial' CHECK (type IN ('free_trial')),
  trial_days      int  NOT NULL DEFAULT 7 CHECK (trial_days > 0),
  active          boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,               -- campaign expiry (NULL = never)
  max_redemptions int,                        -- NULL = unlimited
  redeemed_count  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
-- Locked down: redemption happens only through the SECURITY DEFINER function.
-- No client-facing policies => anon/authenticated cannot read or write directly.

-- 2. Redemptions -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coupon_id        uuid NOT NULL REFERENCES public.coupons(id),
  coupon_code      text NOT NULL,
  kind             text NOT NULL DEFAULT 'free_trial',
  redeemed_at      timestamptz NOT NULL DEFAULT now(),
  trial_start_date timestamptz NOT NULL,
  trial_end_date   timestamptz NOT NULL,
  UNIQUE (user_id, coupon_id)
);
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- A user may redeem at most ONE free-trial coupon, ever.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_one_trial_per_user
  ON public.coupon_redemptions (user_id)
  WHERE kind = 'free_trial';

-- Users can read their own redemptions (for the status card); no client writes.
DROP POLICY IF EXISTS "user reads own redemptions" ON public.coupon_redemptions;
CREATE POLICY "user reads own redemptions" ON public.coupon_redemptions
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Atomic redemption function ---------------------------------------------
-- Runs as the definer so it can write `subscriptions` regardless of RLS. All
-- validation + writes happen in one transaction; any raised exception rolls the
-- whole thing back (including the redeemed_count increment).
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_user_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons;
  v_norm   text := upper(trim(p_code));
  v_start  timestamptz := now();
  v_end    timestamptz;
BEGIN
  IF v_norm = '' THEN RAISE EXCEPTION 'COUPON_NOT_FOUND'; END IF;

  SELECT * INTO v_coupon FROM public.coupons WHERE code = v_norm;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUPON_NOT_FOUND'; END IF;
  IF NOT v_coupon.active THEN RAISE EXCEPTION 'COUPON_INACTIVE'; END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RAISE EXCEPTION 'COUPON_EXPIRED';
  END IF;

  -- Already used a free-trial coupon?
  IF EXISTS (
    SELECT 1 FROM public.coupon_redemptions r
    JOIN public.coupons c ON c.id = r.coupon_id
    WHERE r.user_id = p_user_id AND c.type = 'free_trial'
  ) THEN
    RAISE EXCEPTION 'ALREADY_REDEEMED';
  END IF;

  -- Atomic limit check + increment (NULL max = unlimited).
  UPDATE public.coupons
     SET redeemed_count = redeemed_count + 1
   WHERE id = v_coupon.id
     AND (max_redemptions IS NULL OR redeemed_count < max_redemptions);
  IF NOT FOUND THEN RAISE EXCEPTION 'LIMIT_REACHED'; END IF;

  v_end := v_start + make_interval(days => v_coupon.trial_days);

  INSERT INTO public.coupon_redemptions
    (user_id, coupon_id, coupon_code, kind, redeemed_at, trial_start_date, trial_end_date)
  VALUES (p_user_id, v_coupon.id, v_norm, v_coupon.type, v_start, v_start, v_end);

  -- Grant the trial via the existing subscriptions table.
  INSERT INTO public.subscriptions (user_id, plan, status, current_period_end, updated_at)
  VALUES (p_user_id, 'pro', 'trialing', v_end, now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan = 'pro', status = 'trialing', current_period_end = v_end, updated_at = now();

  RETURN jsonb_build_object(
    'coupon_code', v_norm,
    'trial_days', v_coupon.trial_days,
    'trial_start_date', v_start,
    'trial_end_date', v_end
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Race: a concurrent redemption won the one-trial-per-user index.
    RAISE EXCEPTION 'ALREADY_REDEEMED';
END;
$$;

-- Only the server (service_role) may call this; never clients directly.
REVOKE ALL ON FUNCTION public.redeem_coupon(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid, text) TO service_role;

-- 4. Seed the launch coupon --------------------------------------------------
INSERT INTO public.coupons (code, type, trial_days, active, max_redemptions)
VALUES ('WELCOME7', 'free_trial', 7, true, NULL)
ON CONFLICT (code) DO NOTHING;
