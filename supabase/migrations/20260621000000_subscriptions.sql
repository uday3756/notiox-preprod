-- Subscriptions / billing state.
-- Plan is written ONLY by the service-role key (server-side, after Stripe
-- verification). Authenticated users can read their own row but cannot write
-- it — so nobody can self-upgrade to Pro from the browser.

CREATE TABLE public.subscriptions (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',                 -- 'free' | 'pro'
  status TEXT,                                       -- Stripe subscription status
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reads for the owner; all writes reserved for service_role.
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT-only policy for authenticated users. No INSERT/UPDATE/DELETE policy
-- exists, so RLS denies those for everyone except service_role (which bypasses RLS).
CREATE POLICY "Read own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
