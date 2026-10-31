-- Executive Function score + weekly behavioural patterns.
-- Additive only. RLS owner-scoped (same policy shape as the other user tables).
-- Idempotent: safe to re-run.

create table if not exists public.ef_scores (
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start      date not null,                        -- Monday
  composite       int  not null check (composite between 0 and 100),
  -- NULL at scoring_version 1: Task initiation is excluded because it reads event
  -- timestamps, which the voice->schedule extraction bug gets wrong (handoff §9).
  p_initiation    int,
  p_simplicity    int  not null,
  p_wins          int  not null,
  p_winddown      int  not null,
  archetype       text not null,
  nudge           text,                                 -- model-written, one sentence
  active_days     int  not null,
  -- 1 = three pillars, 2 = all four. Makes the later bump a deliberate, auditable
  -- change rather than unexplained score drift.
  scoring_version int  not null default 1,
  created_at      timestamptz not null default now(),
  primary key (user_id, week_start)
);

create table if not exists public.weekly_patterns (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  kind       text not null check (kind in ('working','worth_trying')),
  body       text not null,                             -- derived, never verbatim
  created_at timestamptz not null default now(),
  primary key (user_id, week_start, kind, body)
);

-- Frequency guard: the upgrade sheet shows at most once per user per week.
alter table public.profiles
  add column if not exists ef_paywall_shown_at timestamptz;

alter table public.ef_scores       enable row level security;
alter table public.weekly_patterns enable row level security;

drop policy if exists ef_scores_owner       on public.ef_scores;
drop policy if exists weekly_patterns_owner on public.weekly_patterns;

create policy ef_scores_owner on public.ef_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy weekly_patterns_owner on public.weekly_patterns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_ef_scores_user_week
  on public.ef_scores (user_id, week_start desc);
