CREATE TABLE public.capture_drafts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  transcript text NOT NULL,
  content jsonb,
  status text NOT NULL DEFAULT 'generating' CHECK(status IN ('generating','ready','failed','saved')),
  saved_map_id uuid REFERENCES public.maps(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.capture_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.capture_drafts FOR SELECT TO authenticated USING(auth.uid()=user_id);
REVOKE ALL ON public.capture_drafts FROM anon,authenticated;
GRANT SELECT ON public.capture_drafts TO authenticated;
GRANT ALL ON public.capture_drafts TO service_role;

CREATE FUNCTION public.notio_claim_draft(p_id uuid,p_transcript text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); draft public.capture_drafts;
BEGIN
  IF actor IS NULL OR length(trim(p_transcript)) NOT BETWEEN 4 AND 30000 THEN RAISE EXCEPTION 'Invalid transcript'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
  SELECT * INTO draft FROM public.capture_drafts WHERE user_id=actor AND request_id=p_id FOR UPDATE;
  IF FOUND THEN
    IF draft.transcript<>p_transcript THEN RAISE EXCEPTION 'Request ID used for a different transcript'; END IF;
    IF draft.status IN ('ready','saved') THEN RETURN jsonb_build_object('claimed',false,'content',draft.content); END IF;
    IF draft.status='generating' AND draft.updated_at>now()-interval '5 minutes' THEN RAISE EXCEPTION 'Generation is still running. Try again shortly.'; END IF;
    UPDATE public.capture_drafts SET status='generating',updated_at=now() WHERE user_id=actor AND request_id=p_id;
  ELSE
    INSERT INTO public.capture_drafts(user_id,request_id,transcript) VALUES(actor,p_id,p_transcript);
  END IF;
  RETURN jsonb_build_object('claimed',true);
END $$;
REVOKE ALL ON FUNCTION public.notio_claim_draft(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_claim_draft(uuid,text) TO authenticated;

CREATE FUNCTION public.notio_save_draft(p_actor uuid,p_id uuid,p_content jsonb,p_positions jsonb,p_logical_date date,p_selected text,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE draft public.capture_drafts; map_uuid uuid; node jsonb; ids jsonb:='{}'; temp_id text; real_id uuid; pending jsonb; remaining jsonb; parent_uuid uuid; root_id text; loops integer:=0;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  SELECT * INTO draft FROM public.capture_drafts WHERE user_id=p_actor AND request_id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF draft.status='saved' THEN
    IF draft.saved_map_id IS NULL THEN RAISE EXCEPTION 'Saved map was removed'; END IF;
    RETURN jsonb_build_object('mapId',draft.saved_map_id,'title',draft.content->>'title');
  END IF;
  IF draft.status<>'ready' THEN RAISE EXCEPTION 'Draft is not ready'; END IF;
  IF p_limit IS NOT NULL AND (SELECT count(*) FROM public.maps WHERE user_id=p_actor AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=p_limit THEN
    RAISE EXCEPTION 'Monthly map limit reached';
  END IF;
  INSERT INTO public.maps(user_id,title,transcript) VALUES(p_actor,p_content->>'title',draft.transcript) RETURNING id INTO map_uuid;
  pending:=p_content->'nodes';
  WHILE jsonb_array_length(pending)>0 LOOP
    loops:=loops+1; IF loops>100 THEN RAISE EXCEPTION 'Invalid node hierarchy'; END IF;
    remaining:='[]';
    FOR node IN SELECT value FROM jsonb_array_elements(pending) LOOP
      temp_id:=node->>'id';
      IF nullif(node->>'parentId','') IS NOT NULL AND NOT ids ? (node->>'parentId') THEN
        remaining:=remaining||jsonb_build_array(node); CONTINUE;
      END IF;
      parent_uuid:=(ids->>(node->>'parentId'))::uuid;
      INSERT INTO public.nodes(map_id,user_id,parent_id,label,detail,x,y,priority,category,time_block,time_block_source,logical_date)
      VALUES(map_uuid,p_actor,parent_uuid,node->>'label',node->>'detail',
        coalesce((p_positions->temp_id->>'x')::float,0),coalesce((p_positions->temp_id->>'y')::float,0),
        CASE WHEN parent_uuid IS NULL THEN 0 ELSE coalesce((node->>'priority')::integer,1) END,node->>'category',
        CASE WHEN node->>'time_block'='unknown' THEN NULL ELSE node->>'time_block' END,
        CASE WHEN node->>'time_block_confidence'='high' THEN 'explicit' ELSE 'inferred' END,
        CASE WHEN node->>'time_block' IN ('morning','afternoon','evening') THEN p_logical_date ELSE NULL END)
      RETURNING id INTO real_id;
      ids:=ids||jsonb_build_object(temp_id,real_id);
      IF parent_uuid IS NULL THEN root_id:=temp_id; END IF;
    END LOOP;
    pending:=remaining;
  END LOOP;
  IF p_selected IS NOT NULL THEN
    IF NOT ids ? p_selected OR p_selected=root_id THEN RAISE EXCEPTION 'Invalid next action'; END IF;
    real_id:=(ids->>p_selected)::uuid;
    INSERT INTO public.scheduling_nodes(user_id,map_id,node_id,title,description)
      SELECT p_actor,map_uuid,id,label,detail FROM public.nodes WHERE id=real_id;
  END IF;
  UPDATE public.capture_drafts SET status='saved',saved_map_id=map_uuid,content=p_content,updated_at=now() WHERE user_id=p_actor AND request_id=p_id;
  RETURN jsonb_build_object('mapId',map_uuid,'title',p_content->>'title');
END $$;
REVOKE ALL ON FUNCTION public.notio_save_draft(uuid,uuid,jsonb,jsonb,date,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notio_save_draft(uuid,uuid,jsonb,jsonb,date,text,integer) TO service_role;
