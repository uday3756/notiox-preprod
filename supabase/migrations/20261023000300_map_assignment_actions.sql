CREATE TABLE public.assignment_notes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.scheduling_nodes(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  content text NOT NULL,
  PRIMARY KEY(user_id,assignment_id,node_id)
);
ALTER TABLE public.assignment_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.assignment_notes FOR SELECT TO authenticated USING(auth.uid()=user_id);
REVOKE ALL ON public.assignment_notes FROM anon,authenticated;
GRANT SELECT ON public.assignment_notes TO authenticated;
GRANT ALL ON public.assignment_notes TO service_role;

CREATE FUNCTION public.notio_attach_map_node(p_node uuid,p_parent uuid,p_title text,p_note_only boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); node public.nodes; task jsonb; parent public.scheduling_nodes;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
  SELECT * INTO node FROM public.nodes WHERE id=p_node AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Node not found'; END IF;
  IF p_parent IS NOT NULL THEN
    SELECT * INTO parent FROM public.scheduling_nodes WHERE id=p_parent AND user_id=actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  END IF;
  IF p_note_only THEN
    IF p_parent IS NULL THEN RAISE EXCEPTION 'Choose an assignment'; END IF;
    INSERT INTO public.assignment_notes(user_id,assignment_id,node_id,content)
      VALUES(actor,p_parent,p_node,coalesce(nullif(node.own_words,''),node.detail,node.label))
      ON CONFLICT(user_id,assignment_id,node_id) DO UPDATE SET content=EXCLUDED.content;
    RETURN jsonb_build_object('assignmentId',p_parent);
  END IF;
  IF length(trim(p_title)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid title'; END IF;
  task:=public.notio_task_for_node(p_node);
  task:=public.notio_save_task((task->>'id')::uuid,p_title,coalesce(nullif(node.own_words,''),node.detail,''),p_parent,
    coalesce((SELECT max(sort_order)+1 FROM public.scheduling_nodes WHERE user_id=actor AND parent_node_id=p_parent),0),
    NULL,(task->>'revision')::integer);
  RETURN jsonb_build_object('assignmentId',coalesce(p_parent,(task->>'id')::uuid));
END $$;
REVOKE ALL ON FUNCTION public.notio_attach_map_node(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_attach_map_node(uuid,uuid,text,boolean) TO authenticated;
