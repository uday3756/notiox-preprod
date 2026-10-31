CREATE TABLE public.task_nudge_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  ignored_count integer NOT NULL DEFAULT 0
);
CREATE TABLE public.task_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.scheduling_nodes(id) ON DELETE CASCADE,
  local_day date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_nudges_owner_day ON public.task_nudges(user_id,local_day,created_at);
ALTER TABLE public.task_nudge_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.task_nudge_settings FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY owner_read ON public.task_nudges FOR SELECT TO authenticated USING(auth.uid()=user_id);
REVOKE ALL ON public.task_nudge_settings,public.task_nudges FROM anon,authenticated;
GRANT SELECT ON public.task_nudge_settings,public.task_nudges TO authenticated;
GRANT ALL ON public.task_nudge_settings,public.task_nudges TO service_role;

CREATE FUNCTION public.notio_nudge_preferences(p_enabled boolean,p_timezone text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'Invalid preferences'; END IF;
  INSERT INTO public.task_nudge_settings(user_id,enabled,timezone) VALUES(auth.uid(),p_enabled,p_timezone)
  ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,timezone=EXCLUDED.timezone,ignored_count=0;
END $$;
REVOKE ALL ON FUNCTION public.notio_nudge_preferences(boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_nudge_preferences(boolean,text) TO authenticated;

CREATE FUNCTION public.notio_claim_nudge() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); config public.task_nudge_settings; local_now timestamp; recent public.task_nudges; candidate public.scheduling_nodes; nudge_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
  SELECT * INTO config FROM public.task_nudge_settings WHERE user_id=actor;
  IF NOT FOUND OR NOT config.enabled THEN RETURN NULL; END IF;
  local_now:=now() AT TIME ZONE config.timezone;
  IF extract(hour FROM local_now)<8 OR extract(hour FROM local_now)>=22 OR config.ignored_count>=2 THEN RETURN NULL; END IF;
  SELECT * INTO recent FROM public.task_nudges WHERE user_id=actor ORDER BY created_at DESC LIMIT 1;
  IF recent.status='pending' AND recent.created_at<now()-interval '15 minutes' THEN
    UPDATE public.task_nudges SET status='ignored' WHERE id=recent.id;
    UPDATE public.task_nudge_settings SET ignored_count=ignored_count+1 WHERE user_id=actor RETURNING * INTO config;
    IF config.ignored_count>=2 THEN RETURN NULL; END IF;
  ELSIF recent.status='pending' THEN
    SELECT * INTO candidate FROM public.scheduling_nodes WHERE id=recent.task_id AND user_id=actor AND status<>'completed';
    IF FOUND THEN RETURN jsonb_build_object('id',recent.id,'taskId',candidate.id,'title',candidate.title,'estimate',candidate.estimated_duration_minutes); END IF;
    UPDATE public.task_nudges SET status='started' WHERE id=recent.id;
    RETURN NULL;
  END IF;
  IF recent.created_at>now()-interval '15 minutes' THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM public.task_nudges WHERE user_id=actor AND local_day=local_now::date)>=3 THEN RETURN NULL; END IF;
  SELECT * INTO candidate FROM public.scheduling_nodes s
    WHERE s.user_id=actor AND s.status='pending' AND NOT s.link_review_required
      AND NOT EXISTS(SELECT 1 FROM public.scheduling_nodes child WHERE child.user_id=actor AND child.parent_node_id=s.id)
      AND NOT EXISTS(SELECT 1 FROM public.task_nudges n WHERE n.user_id=actor AND n.task_id=s.id AND
        ((n.status='not_today' AND n.local_day=local_now::date) OR (n.status='snoozed' AND n.snoozed_until>now())))
    ORDER BY s.sort_order,s.created_at LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.task_nudges(user_id,task_id,local_day) VALUES(actor,candidate.id,local_now::date) RETURNING id INTO nudge_id;
  RETURN jsonb_build_object('id',nudge_id,'taskId',candidate.id,'title',candidate.title,'estimate',candidate.estimated_duration_minutes);
END $$;
REVOKE ALL ON FUNCTION public.notio_claim_nudge() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_claim_nudge() TO authenticated;

CREATE FUNCTION public.notio_respond_nudge(p_id uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR p_action NOT IN ('started','snoozed','not_today','dismissed') THEN RAISE EXCEPTION 'Invalid response'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  UPDATE public.task_nudges SET status=p_action,snoozed_until=CASE WHEN p_action='snoozed' THEN now()+interval '15 minutes' ELSE NULL END
    WHERE id=p_id AND user_id=auth.uid() AND status='pending';
  IF FOUND THEN UPDATE public.task_nudge_settings SET ignored_count=CASE WHEN p_action='dismissed' THEN ignored_count+1 ELSE 0 END WHERE user_id=auth.uid(); END IF;
END $$;
REVOKE ALL ON FUNCTION public.notio_respond_nudge(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_respond_nudge(uuid,text) TO authenticated;
