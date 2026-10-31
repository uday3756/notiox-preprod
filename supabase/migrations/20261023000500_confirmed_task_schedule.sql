CREATE FUNCTION public.notio_schedule_task(p_id uuid,p_revision integer,p_start timestamptz,p_end timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); task public.scheduling_nodes; alternative timestamptz;
BEGIN
  IF actor IS NULL OR p_start IS NULL OR p_end IS NULL OR p_start>=p_end THEN RAISE EXCEPTION 'Invalid schedule'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
  SELECT * INTO task FROM public.scheduling_nodes WHERE id=p_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND OR task.link_review_required THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF task.revision<>p_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
  SELECT max(coalesce(s.end_time,s.start_time+make_interval(mins=>coalesce(s.estimated_duration_minutes,30)))) INTO alternative
    FROM public.scheduling_nodes s WHERE s.user_id=actor AND s.id<>p_id AND s.status IN ('pending','in_progress')
      AND s.start_time<p_end AND coalesce(s.end_time,s.start_time+make_interval(mins=>coalesce(s.estimated_duration_minutes,30)))>p_start;
  IF alternative IS NOT NULL THEN RETURN jsonb_build_object('conflict',true,'suggestedStart',alternative); END IF;
  UPDATE public.scheduling_nodes SET start_time=p_start,end_time=p_end,is_timebound=true,updated_at=now() WHERE id=p_id RETURNING * INTO task;
  INSERT INTO public.completion_export_outbox(user_id,task_id,revision) VALUES(actor,p_id,task.revision)
    ON CONFLICT(user_id,task_id) DO UPDATE SET revision=EXCLUDED.revision,attempts=0;
  RETURN jsonb_build_object('conflict',false,'revision',task.revision);
END $$;
REVOKE ALL ON FUNCTION public.notio_schedule_task(uuid,integer,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_schedule_task(uuid,integer,timestamptz,timestamptz) TO authenticated;
