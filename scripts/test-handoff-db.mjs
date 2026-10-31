import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const user = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const task = "20000000-0000-4000-8000-000000000001";
let checks = 0;
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    INSERT INTO auth.users VALUES('${user}'),('${other}');
    CREATE TABLE public.maps(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,title text,transcript text,created_at timestamptz DEFAULT now());
    CREATE TABLE public.nodes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),map_id uuid,user_id uuid,parent_id uuid,label text,detail text,
      done boolean DEFAULT false,completed_at timestamptz,logical_date date,time_block text,time_block_source text,x float,y float,priority integer,category text);
    CREATE TABLE public.user_working_hours(user_id uuid,timezone text,day_start_hour integer);
    INSERT INTO public.user_working_hours VALUES('${user}','Asia/Kolkata',4);`);
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20260621020000_scheduling_nodes.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20260621120000_scheduling_map_link.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20261023000100_canonical_completion.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    `INSERT INTO public.scheduling_nodes(id,user_id,title) VALUES($1,$2,'Test task')`,
    [task, user],
  );
  const complete = async (desired, revision, action = crypto.randomUUID(), actor = user) => {
    const r = await db.query(
      `SELECT public.notio_set_completion($1,$2,$3,$4,$5,'home',true,'2026-10-23','morning') result`,
      [actor, task, desired, revision, action],
    );
    return r.rows[0].result;
  };
  const action = crypto.randomUUID();
  const done = await complete(true, 0, action);
  assert.equal(done.confirmedXp, 10);
  checks++;
  assert.deepEqual(await complete(true, 0, action), { ...done, wasAlreadyApplied: true });
  checks++;
  assert.equal((await complete(true, 1)).rewardChange, 0);
  checks++;
  await assert.rejects(() => complete(false, 0), /STALE_REVISION/);
  checks++;
  await assert.rejects(() => complete(false, 1, action), /different command/);
  checks++;
  await assert.rejects(() => complete(true, 1, crypto.randomUUID(), other), /Task not found/);
  checks++;
  const undo = await complete(false, 1);
  assert.equal(undo.confirmedXp, 0);
  checks++;
  const redo = await complete(true, 2);
  assert.equal(redo.confirmedXp, 10);
  checks++;
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO public.scheduling_nodes(user_id,title,parent_node_id) VALUES($1,'Child',$2)`,
        [user, task],
      ),
    /Undo parent/,
  );
  checks++;
  await complete(false, 3);
  await db.query(
    `INSERT INTO public.scheduling_nodes(user_id,title,parent_node_id) VALUES($1,'Child',$2)`,
    [user, task],
  );
  assert.equal((await complete(true, 4)).rewardChange, 0);
  checks++;
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}';`);
  await assert.rejects(() => complete(true, 5), /permission denied/);
  checks++;
  await assert.rejects(
    () => db.query(`UPDATE public.dolphin_profiles SET confirmed_xp=999 WHERE user_id=$1`, [user]),
    /permission denied/,
  );
  checks++;
  const rows = await db.query("SELECT * FROM public.dolphin_profiles");
  assert.equal(rows.rows.length, 1);
  checks++;
  await db.exec(`SET request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query("SELECT * FROM public.xp_ledger")).rows.length, 0);
  checks++;
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${user}';`);
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20261023000200_reviewed_capture.sql", import.meta.url),
      "utf8",
    ),
  );
  const draftId = crypto.randomUUID(),
    mapDraft = {
      title: "Essay",
      nodes: [
        { id: "root", label: "Essay", parentId: null, priority: 0, time_block: "unknown" },
        {
          id: "thesis",
          label: "Write thesis",
          parentId: "root",
          priority: 1,
          time_block: "morning",
          time_block_confidence: "high",
        },
      ],
    };
  const claim = await db.query("SELECT public.notio_claim_draft($1,$2) result", [
    draftId,
    "My reviewed essay thought",
  ]);
  assert.equal(claim.rows[0].result.claimed, true);
  checks++;
  await assert.rejects(
    () =>
      db.query("SELECT public.notio_claim_draft($1,$2)", [draftId, "My reviewed essay thought"]),
    /still running/,
  );
  checks++;
  await db.query(`UPDATE public.capture_drafts SET content=$1,status='ready' WHERE request_id=$2`, [
    JSON.stringify(mapDraft),
    draftId,
  ]);
  assert.equal(
    (
      await db.query("SELECT public.notio_claim_draft($1,$2) result", [
        draftId,
        "My reviewed essay thought",
      ])
    ).rows[0].result.claimed,
    false,
  );
  checks++;
  await assert.rejects(
    () =>
      db.query("SELECT public.notio_claim_draft($1,$2)", [draftId, "Different reviewed thought"]),
    /different transcript/,
  );
  checks++;
  const save = () =>
    db.query(`SELECT public.notio_save_draft($1,$2,$3,'{}','2026-10-23','thesis',8) result`, [
      user,
      draftId,
      JSON.stringify(mapDraft),
    ]);
  const saved = (await save()).rows[0].result;
  assert.equal((await save()).rows[0].result.mapId, saved.mapId);
  checks++;
  assert.equal((await db.query("SELECT count(*)::int n FROM public.maps")).rows[0].n, 1);
  checks++;
  assert.equal((await db.query("SELECT count(*)::int n FROM public.nodes")).rows[0].n, 2);
  checks++;
  assert.equal(
    (
      await db.query("SELECT count(*)::int n FROM public.scheduling_nodes WHERE map_id=$1", [
        saved.mapId,
      ])
    ).rows[0].n,
    1,
  );
  checks++;
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query("SELECT * FROM public.capture_drafts")).rows.length, 0);
  checks++;
  await db.exec(
    `RESET ROLE; SET request.jwt.claim.sub='${user}'; ALTER TABLE public.nodes ADD COLUMN own_words text;`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20261023000300_map_assignment_actions.sql", import.meta.url),
      "utf8",
    ),
  );
  const sourceNode = (
    await db.query("SELECT id FROM public.nodes WHERE parent_id IS NOT NULL LIMIT 1")
  ).rows[0].id;
  await db.query("UPDATE public.nodes SET own_words=$1 WHERE id=$2", [
    "My original articulation",
    sourceNode,
  ]);
  const beforeTasks = (await db.query("SELECT count(*)::int n FROM public.scheduling_nodes"))
    .rows[0].n;
  await db.query("SELECT public.notio_attach_map_node($1,$2,$3,true)", [sourceNode, task, "Essay"]);
  await db.query("SELECT public.notio_attach_map_node($1,$2,$3,true)", [sourceNode, task, "Essay"]);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM public.assignment_notes")).rows[0].n,
    1,
  );
  checks++;
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM public.scheduling_nodes")).rows[0].n,
    beforeTasks,
  );
  checks++;
  assert.equal(
    (await db.query("SELECT content FROM public.assignment_notes")).rows[0].content,
    "My original articulation",
  );
  checks++;
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20261023000400_actionable_nudges.sql", import.meta.url),
      "utf8",
    ),
  );
  const claimNudge = async () =>
    (await db.query("SELECT public.notio_claim_nudge() result")).rows[0].result;
  assert.equal(await claimNudge(), null);
  checks++;
  const hour = new Date((await db.query("SELECT now() instant")).rows[0].instant).getUTCHours();
  const zoneFor = (target) => {
    let offset = target - hour;
    if (offset < -12) offset += 24;
    if (offset > 12) offset -= 24;
    return offset === 0 ? "UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
  };
  await db.query("SELECT public.notio_nudge_preferences(true,$1)", [zoneFor(2)]);
  assert.equal(await claimNudge(), null);
  checks++;
  await db.query("SELECT public.notio_nudge_preferences(true,$1)", [zoneFor(12)]);
  const firstNudge = await claimNudge();
  assert.ok(firstNudge?.id);
  checks++;
  assert.equal((await claimNudge()).id, firstNudge.id);
  checks++;
  await db.query("SELECT public.notio_respond_nudge($1,'dismissed')", [firstNudge.id]);
  await db.exec("UPDATE public.task_nudges SET created_at=now()-interval '16 minutes'");
  const secondNudge = await claimNudge();
  await db.query("SELECT public.notio_respond_nudge($1,'dismissed')", [secondNudge.id]);
  assert.equal(await claimNudge(), null);
  checks++;
  await db.query("SELECT public.notio_nudge_preferences(true,$1)", [zoneFor(12)]);
  await db.exec("UPDATE public.task_nudges SET created_at=now()-interval '16 minutes'");
  const thirdNudge = await claimNudge();
  await db.query("SELECT public.notio_respond_nudge($1,'snoozed')", [thirdNudge.id]);
  const snoozed = (
    await db.query("SELECT status,snoozed_until FROM public.task_nudges WHERE id=$1", [
      thirdNudge.id,
    ])
  ).rows[0];
  assert.equal(snoozed.status, "snoozed");
  assert.ok(snoozed.snoozed_until);
  checks++;
  await db.exec("UPDATE public.task_nudges SET created_at=now()-interval '16 minutes'");
  assert.equal(await claimNudge(), null);
  checks++;
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query("SELECT * FROM public.task_nudges")).rows.length, 0);
  checks++;
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${user}';`);
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20261023000500_confirmed_task_schedule.sql", import.meta.url),
      "utf8",
    ),
  );
  const linkedTask = (
    await db.query("SELECT id,revision FROM public.scheduling_nodes WHERE node_id=$1", [sourceNode])
  ).rows[0];
  const firstReward = (
    await db.query(
      "SELECT public.notio_set_completion($1,$2,true,$3,$4,'assignment',true,'2026-10-23','morning') result",
      [user, linkedTask.id, linkedTask.revision, crypto.randomUUID()],
    )
  ).rows[0].result;
  await db.query("DELETE FROM public.scheduling_nodes WHERE id=$1", [linkedTask.id]);
  const replacement = crypto.randomUUID();
  await db.query(
    "INSERT INTO public.scheduling_nodes(id,user_id,node_id,map_id,title) VALUES($1,$2,$3,$4,'Replacement')",
    [replacement, user, sourceNode, saved.mapId],
  );
  const replayed = (
    await db.query(
      "SELECT public.notio_set_completion($1,$2,true,0,$3,'assignment',true,'2026-10-23','morning') result",
      [user, replacement, crypto.randomUUID()],
    )
  ).rows[0].result;
  assert.equal(replayed.confirmedXp, firstReward.confirmedXp);
  assert.equal(replayed.rewardChange, 0);
  checks++;
  const scheduleId = crypto.randomUUID();
  await db.query(
    "INSERT INTO public.scheduling_nodes(id,user_id,title) VALUES($1,$2,'Scheduled')",
    [scheduleId, user],
  );
  const schedule = async (id, revision, start, end) =>
    (
      await db.query("SELECT public.notio_schedule_task($1,$2,$3,$4) result", [
        id,
        revision,
        start,
        end,
      ])
    ).rows[0].result;
  assert.equal(
    (await schedule(scheduleId, 0, "2026-10-24T10:00:00Z", "2026-10-24T11:00:00Z")).conflict,
    false,
  );
  checks++;
  const nextTask = crypto.randomUUID();
  await db.query("INSERT INTO public.scheduling_nodes(id,user_id,title) VALUES($1,$2,'Another')", [
    nextTask,
    user,
  ]);
  const conflict = await schedule(nextTask, 0, "2026-10-24T10:30:00Z", "2026-10-24T11:30:00Z");
  assert.equal(conflict.conflict, true);
  checks++;
  assert.equal(
    (await db.query("SELECT start_time FROM public.scheduling_nodes WHERE id=$1", [nextTask]))
      .rows[0].start_time,
    null,
  );
  checks++;
  assert.equal(
    (await schedule(nextTask, 0, "2026-10-24T11:00:00Z", "2026-10-24T12:00:00Z")).conflict,
    false,
  );
  checks++;
  await assert.rejects(
    () => schedule(nextTask, 0, "2026-10-25T11:00:00Z", "2026-10-25T12:00:00Z"),
    /STALE_REVISION/,
  );
  checks++;
  await db.exec(
    `GRANT SELECT,UPDATE ON public.scheduling_nodes TO authenticated; SET ROLE authenticated;`,
  );
  await assert.rejects(
    () => db.query("UPDATE public.scheduling_nodes SET status='completed' WHERE id=$1", [nextTask]),
    /authenticated task service/,
  );
  checks++;
  console.log(
    `PASS ${checks} isolated PostgreSQL migration/completion/RLS checks. No remote database used.`,
  );
} finally {
  await db.close();
}
