-- Read-only checks. Run in staging first and record results before approving migration.
SELECT version();
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT user_id,node_id,count(*) AS links FROM public.scheduling_nodes WHERE node_id IS NOT NULL GROUP BY user_id,node_id HAVING count(*)>1;
SELECT s.id AS task_id,s.node_id FROM public.scheduling_nodes s JOIN public.nodes n ON n.id=s.node_id
WHERE s.user_id<>n.user_id OR s.map_id IS DISTINCT FROM n.map_id OR (s.status='completed') IS DISTINCT FROM coalesce(n.done,false);
SELECT count(*) AS map_count FROM public.maps;
SELECT count(*) AS node_count FROM public.nodes;
SELECT count(*) AS task_count FROM public.scheduling_nodes;
SELECT count(*) AS articulation_count FROM public.nodes WHERE nullif(own_words,'') IS NOT NULL;
