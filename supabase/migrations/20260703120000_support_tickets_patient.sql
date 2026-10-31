-- Patient-app Support Ticket System.
-- Additive: extends the existing public.support_tickets (shared with the admin
-- hub) with patient-facing fields, adds a persistent bonus-credits column to
-- profiles, a screenshots storage bucket, and an atomic submit+reward RPC.
-- The description is stored in the existing `body` column (kept NOT NULL).

-- 1. Extend support_tickets --------------------------------------------------
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_id      text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_type    text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS full_name      text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS email          text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS screenshot_url text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS admin_reply    text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS reward_given   boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_id_key
  ON public.support_tickets (ticket_id) WHERE ticket_id IS NOT NULL;

-- ticket_type is nullable (legacy rows) but constrained when present.
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_ticket_type_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_ticket_type_check
  CHECK (ticket_type IS NULL OR ticket_type = ANY (ARRAY[
    'bug_report','feature_request','technical_issue','billing','account_issue','other'
  ]));

-- Widen status to the patient-facing lifecycle (keep legacy 'pending').
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check
  CHECK (status = ANY (ARRAY['open','in_progress','waiting_user','resolved','closed','pending']));

-- 2. Persistent bonus map credits on profiles -------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bonus_map_credits int NOT NULL DEFAULT 0;

-- 3. Screenshot storage bucket ----------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may upload only into their own <uid>/… folder.
DROP POLICY IF EXISTS "support upload own" ON storage.objects;
CREATE POLICY "support upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "support read attachments" ON storage.objects;
CREATE POLICY "support read attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'support-attachments');

-- 4. Atomic submit + reward --------------------------------------------------
-- SECURITY DEFINER: inserts the ticket for p_user_id and awards a fixed +3
-- bonus credits in one transaction. reward_given is set true at creation, so a
-- ticket can never be rewarded twice. Called by the server fn with the
-- JWT-verified user id (never trusts a client-supplied id).
DROP FUNCTION IF EXISTS public.submit_support_ticket(text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.submit_support_ticket(
  p_user_id      uuid,
  p_ticket_type  text,
  p_full_name    text,
  p_email        text,
  p_subject      text,
  p_description  text,
  p_screenshot_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := p_user_id;
  v_ticket_id text;
  v_id uuid;
  v_credits int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF coalesce(btrim(p_subject), '') = '' THEN RAISE EXCEPTION 'SUBJECT_REQUIRED'; END IF;
  IF coalesce(btrim(p_description), '') = '' THEN RAISE EXCEPTION 'DESCRIPTION_REQUIRED'; END IF;
  IF p_ticket_type IS NULL OR p_ticket_type NOT IN
     ('bug_report','feature_request','technical_issue','billing','account_issue','other') THEN
    RAISE EXCEPTION 'INVALID_TICKET_TYPE';
  END IF;

  -- Unique human-friendly id: NT-XXXXXXXX
  LOOP
    v_ticket_id := 'NT-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE ticket_id = v_ticket_id);
  END LOOP;

  INSERT INTO public.support_tickets
    (user_id, kind, ticket_type, full_name, email, subject, body,
     screenshot_url, status, reward_given, ticket_id, created_at, updated_at)
  VALUES
    (v_uid, 'user', p_ticket_type, p_full_name, p_email, btrim(p_subject), btrim(p_description),
     p_screenshot_url, 'open', true, v_ticket_id, now(), now())
  RETURNING id INTO v_id;

  UPDATE public.profiles
     SET bonus_map_credits = coalesce(bonus_map_credits, 0) + 3,
         updated_at = now()
   WHERE id = v_uid
  RETURNING bonus_map_credits INTO v_credits;

  RETURN jsonb_build_object(
    'id', v_id,
    'ticket_id', v_ticket_id,
    'credits_awarded', 3,
    'bonus_credits_total', coalesce(v_credits, 3)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_support_ticket(uuid, text, text, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_support_ticket(uuid, text, text, text, text, text, text) TO service_role;
