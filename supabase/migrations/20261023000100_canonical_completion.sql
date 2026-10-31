-- Staging first. No historical reward backfill. Apply with the matching app release.
ALTER TABLE public.scheduling_nodes ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.scheduling_nodes ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.scheduling_nodes ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'task';
ALTER TABLE public.scheduling_nodes ADD COLUMN IF NOT EXISTS link_review_required boolean NOT NULL DEFAULT false;

UPDATE public.scheduling_nodes s SET link_review_required = true
WHERE s.node_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.scheduling_nodes other
  WHERE other.user_id = s.user_id AND other.node_id = s.node_id AND other.id <> s.id
);
UPDATE public.scheduling_nodes s SET link_review_required=true
FROM public.nodes n WHERE s.node_id=n.id AND
  (n.user_id<>s.user_id OR s.map_id IS DISTINCT FROM n.map_id OR (s.status='completed') IS DISTINCT FROM coalesce(n.done,false));
CREATE UNIQUE INDEX scheduling_one_unambiguous_node ON public.scheduling_nodes(user_id, node_id)
WHERE node_id IS NOT NULL AND NOT link_review_required;

CREATE TABLE public.dolphin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  confirmed_xp integer NOT NULL DEFAULT 0 CHECK (confirmed_xp >= 0),
  companion_enabled boolean NOT NULL DEFAULT true,
  policy_version text NOT NULL DEFAULT 'leaf-v1'
);
CREATE TABLE public.task_reward_balances (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  reward_identity text NOT NULL,
  awarded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, reward_identity)
);
CREATE TABLE public.completion_actions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id uuid NOT NULL,
  command jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_id)
);
CREATE TABLE public.xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  reward_identity text NOT NULL,
  action_id uuid NOT NULL,
  delta integer NOT NULL CHECK (delta IN (-10,10)),
  policy_version text NOT NULL DEFAULT 'leaf-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_id)
);
CREATE TABLE public.completion_export_outbox (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  revision integer NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
ALTER TABLE public.dolphin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reward_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_export_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.dolphin_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY owner_read ON public.task_reward_balances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY owner_read ON public.completion_actions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY owner_read ON public.xp_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY owner_read ON public.completion_export_outbox FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.dolphin_profiles, public.task_reward_balances, public.completion_actions, public.xp_ledger, public.completion_export_outbox FROM anon, authenticated;
GRANT SELECT ON public.dolphin_profiles, public.task_reward_balances, public.completion_actions, public.xp_ledger, public.completion_export_outbox TO authenticated;
GRANT ALL ON public.dolphin_profiles, public.task_reward_balances, public.completion_actions, public.xp_ledger, public.completion_export_outbox TO service_role;

CREATE FUNCTION public.notio_set_completion(p_actor uuid, p_entity_id uuid, p_desired boolean, p_revision integer, p_action_id uuid, p_source text, p_award_xp boolean DEFAULT false, p_logical_date date DEFAULT NULL, p_time_block text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := p_actor; task public.scheduling_nodes; cached public.completion_actions;
  command jsonb; result jsonb; was_done boolean; was_awarded boolean := false;
  eligible boolean; delta integer := 0; total integer;
  reward_key text;
  timezone_name text := 'UTC'; day_start integer := 4; logical_day date; block_name text;
BEGIN
  IF actor IS NULL OR p_revision < 0 OR p_source NOT IN ('home','map','plan','assignment','android-widget','ios-widget') THEN
    RAISE EXCEPTION 'Invalid completion command';
  END IF;
  -- One owner-level lock also serializes parent/child actions and progression totals.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  command := jsonb_build_object('entityId',p_entity_id,'desiredState',p_desired,'expectedRevision',p_revision,'source',p_source);
  SELECT * INTO cached FROM public.completion_actions WHERE user_id=actor AND action_id=p_action_id;
  IF FOUND THEN
    IF cached.command <> command THEN RAISE EXCEPTION 'Action ID already used for a different command'; END IF;
    RETURN cached.result || jsonb_build_object('wasAlreadyApplied',true);
  END IF;
  SELECT * INTO task FROM public.scheduling_nodes WHERE id=p_entity_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF task.link_review_required THEN RAISE EXCEPTION 'Task link needs review'; END IF;
  IF task.revision <> p_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
  IF task.node_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.nodes WHERE id=task.node_id AND user_id=actor) THEN
    RAISE EXCEPTION 'Invalid map link';
  END IF;
  was_done := task.status = 'completed';
  reward_key := CASE WHEN task.node_id IS NOT NULL THEN 'node:'||task.node_id::text ELSE 'task:'||task.id::text END;
  eligible := NOT EXISTS (SELECT 1 FROM public.scheduling_nodes WHERE parent_node_id=task.id AND user_id=actor);
  INSERT INTO public.dolphin_profiles(user_id) VALUES(actor) ON CONFLICT DO NOTHING;
  SELECT awarded INTO was_awarded FROM public.task_reward_balances WHERE user_id=actor AND reward_identity=reward_key;
  was_awarded := coalesce(was_awarded,false);
  IF was_done IS DISTINCT FROM p_desired THEN
    UPDATE public.scheduling_nodes SET status=CASE WHEN p_desired THEN 'completed' ELSE 'pending' END,
      completed_at=CASE WHEN p_desired THEN now() ELSE NULL END, revision=revision+1, updated_at=now()
      WHERE id=task.id RETURNING * INTO task;
    -- Existing completion remains authoritative; no award for replaying a historical done row.
    IF p_desired AND eligible AND p_award_xp AND NOT was_awarded THEN delta := 10;
    ELSIF NOT p_desired AND was_awarded THEN delta := -10; END IF;
    IF delta <> 0 THEN
      INSERT INTO public.task_reward_balances(user_id,task_id,reward_identity,awarded) VALUES(actor,task.id,reward_key,delta>0)
        ON CONFLICT(user_id,reward_identity) DO UPDATE SET awarded=EXCLUDED.awarded,task_id=EXCLUDED.task_id;
      INSERT INTO public.xp_ledger(user_id,task_id,reward_identity,action_id,delta) VALUES(actor,task.id,reward_key,p_action_id,delta);
      UPDATE public.dolphin_profiles SET confirmed_xp=confirmed_xp+delta WHERE user_id=actor;
    END IF;
    IF task.node_id IS NOT NULL THEN
      SELECT coalesce(timezone,'UTC'),coalesce(day_start_hour,4) INTO timezone_name,day_start
        FROM public.user_working_hours WHERE user_id=actor;
      logical_day := coalesce(p_logical_date,(now() AT TIME ZONE coalesce(timezone_name,'UTC') - make_interval(hours=>coalesce(day_start,4)))::date);
      block_name := coalesce(p_time_block,CASE WHEN extract(hour FROM now() AT TIME ZONE coalesce(timezone_name,'UTC')) < 12 THEN 'morning'
                         WHEN extract(hour FROM now() AT TIME ZONE coalesce(timezone_name,'UTC')) < 17 THEN 'afternoon' ELSE 'evening' END);
      UPDATE public.nodes SET done=p_desired, completed_at=CASE WHEN p_desired THEN now() ELSE NULL END,
        logical_date=CASE WHEN p_desired THEN logical_day ELSE NULL END,
        time_block=coalesce(time_block,block_name),
        time_block_source=CASE WHEN time_block IS NULL THEN 'default' ELSE time_block_source END
        WHERE id=task.node_id AND user_id=actor;
    END IF;
    IF task.start_time IS NOT NULL OR to_jsonb(task)->>'google_event_id' IS NOT NULL THEN
      INSERT INTO public.completion_export_outbox(user_id,task_id,revision) VALUES(actor,task.id,task.revision)
        ON CONFLICT(user_id,task_id) DO UPDATE SET revision=EXCLUDED.revision, attempts=0;
    END IF;
  END IF;
  SELECT confirmed_xp INTO total FROM public.dolphin_profiles WHERE user_id=actor;
  result := jsonb_build_object('entityId',task.id,'completed',p_desired,'revision',task.revision,'confirmedXp',total,'level',1+total/100,'rewardChange',delta);
  INSERT INTO public.completion_actions(user_id,action_id,command,result) VALUES(actor,p_action_id,command,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.notio_set_completion(uuid,uuid,boolean,integer,uuid,text,boolean,date,text) FROM PUBLIC,anon,authenticated;
-- Only the verified application server chooses whether XP is enabled.
GRANT EXECUTE ON FUNCTION public.notio_set_completion(uuid,uuid,boolean,integer,uuid,text,boolean,date,text) TO service_role;

CREATE FUNCTION public.notio_task_for_node(p_node_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); node public.nodes; task public.scheduling_nodes;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
  SELECT * INTO node FROM public.nodes WHERE id=p_node_id AND user_id=actor;
  IF NOT FOUND OR node.parent_id IS NULL THEN RAISE EXCEPTION 'Actionable node not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.scheduling_nodes WHERE user_id=actor AND node_id=node.id AND link_review_required) THEN
    RAISE EXCEPTION 'Task link needs review';
  END IF;
  SELECT * INTO task FROM public.scheduling_nodes WHERE user_id=actor AND node_id=node.id AND NOT link_review_required;
  IF NOT FOUND THEN
    INSERT INTO public.scheduling_nodes(user_id,title,description,map_id,node_id,status,completed_at)
      VALUES(actor,node.label,node.detail,node.map_id,node.id,CASE WHEN node.done THEN 'completed' ELSE 'pending' END,node.completed_at)
      RETURNING * INTO task;
  END IF;
  RETURN to_jsonb(task);
END $$;
REVOKE ALL ON FUNCTION public.notio_task_for_node(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_task_for_node(uuid) TO authenticated;

CREATE FUNCTION public.notio_companion_preference(p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO public.dolphin_profiles(user_id,companion_enabled) VALUES(auth.uid(),p_enabled)
    ON CONFLICT(user_id) DO UPDATE SET companion_enabled=EXCLUDED.companion_enabled;
END $$;
REVOKE ALL ON FUNCTION public.notio_companion_preference(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_companion_preference(boolean) TO authenticated;

-- Reject cross-owner links and loops even if writes originate outside the new UI.
CREATE FUNCTION public.notio_validate_task_links() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.node_id IS DISTINCT FROM OLD.node_id OR NEW.map_id IS DISTINCT FROM OLD.map_id
      OR NEW.link_review_required IS DISTINCT FROM OLD.link_review_required OR NEW.status IS DISTINCT FROM OLD.status OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
      RAISE EXCEPTION 'Use the authenticated task service for completion and identity changes';
    END IF;
    IF TG_OP='INSERT' AND (NEW.link_review_required OR NEW.status='completed') THEN RAISE EXCEPTION 'Invalid initial task state'; END IF;
  END IF;
  IF NEW.parent_node_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.scheduling_nodes WHERE id=NEW.parent_node_id AND user_id=NEW.user_id) THEN
      RAISE EXCEPTION 'Invalid parent';
    END IF;
    IF NEW.id=NEW.parent_node_id OR EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT id,parent_node_id FROM public.scheduling_nodes WHERE id=NEW.parent_node_id
        UNION SELECT s.id,s.parent_node_id FROM public.scheduling_nodes s JOIN ancestors a ON s.id=a.parent_node_id
      ) SELECT 1 FROM ancestors WHERE id=NEW.id
    ) THEN RAISE EXCEPTION 'Task cycle'; END IF;
    IF EXISTS(SELECT 1 FROM public.task_reward_balances b JOIN public.scheduling_nodes p ON p.id=NEW.parent_node_id
      WHERE b.user_id=NEW.user_id AND b.reward_identity=CASE WHEN p.node_id IS NOT NULL THEN 'node:'||p.node_id::text ELSE 'task:'||p.id::text END AND b.awarded) THEN
      RAISE EXCEPTION 'Undo parent completion before adding steps';
    END IF;
  END IF;
  IF NEW.node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.nodes WHERE id=NEW.node_id AND map_id=NEW.map_id AND user_id=NEW.user_id) THEN
    RAISE EXCEPTION 'Invalid node link';
  END IF;
  IF TG_OP='UPDATE' THEN NEW.revision:=OLD.revision+1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notio_task_links BEFORE INSERT OR UPDATE ON public.scheduling_nodes
FOR EACH ROW EXECUTE FUNCTION public.notio_validate_task_links();

CREATE FUNCTION public.notio_save_task(p_id uuid,p_title text,p_description text,p_parent uuid,p_order integer,p_estimate integer,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); task public.scheduling_nodes;
BEGIN
  IF actor IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 500 OR p_order<0 OR (p_estimate IS NOT NULL AND p_estimate<=0) THEN
    RAISE EXCEPTION 'Invalid task';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
  SELECT * INTO task FROM public.scheduling_nodes WHERE id=p_id AND user_id=actor FOR UPDATE;
  IF FOUND THEN
    IF task.revision<>p_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
    UPDATE public.scheduling_nodes SET title=trim(p_title),description=p_description,parent_node_id=p_parent,
      sort_order=p_order,estimated_duration_minutes=p_estimate,updated_at=now() WHERE id=task.id RETURNING * INTO task;
  ELSE
    IF EXISTS(SELECT 1 FROM public.scheduling_nodes WHERE id=p_id) THEN RAISE EXCEPTION 'Task not found'; END IF;
    INSERT INTO public.scheduling_nodes(id,user_id,title,description,parent_node_id,sort_order,estimated_duration_minutes)
      VALUES(p_id,actor,trim(p_title),p_description,p_parent,p_order,p_estimate) RETURNING * INTO task;
  END IF;
  RETURN to_jsonb(task);
END $$;
REVOKE ALL ON FUNCTION public.notio_save_task(uuid,text,text,uuid,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notio_save_task(uuid,text,text,uuid,integer,integer,integer) TO authenticated;
