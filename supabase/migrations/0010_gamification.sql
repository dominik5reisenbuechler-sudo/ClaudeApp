-- 0010 — XP ledger, achievements.
--
-- Two shapes, and the difference between them is the whole design:
--
--   `xp_events` is an append-only LEDGER. Total XP is a sum over it, never a
--   stored counter. A counter drifts — one retried mutation, one failed write,
--   and the number on the dashboard stops corresponding to anything. A sum is
--   always right and always explainable back to the day it came from.
--
--   `user_achievements` is a RECORD OF A MOMENT. It cannot be recomputed,
--   because an achievement must not un-unlock when an old log is deleted. What
--   was true on the day it was earned stays true.
--
-- There is deliberately no `streaks` table. Streaks are a pure function of logs
-- the client has already fetched, and caching them would create a second source
-- of truth that can disagree with the logs it summarises. See
-- DATABASE_SCHEMA.md, "What is intentionally not stored".

create type public.xp_kind as enum (
  'workout_completed',
  'calorie_target',
  'protein_target',
  'step_goal',
  'weight_logged',
  'meal_plan',
  'checkin_completed',
  'achievement'
);

create type public.achievement_category as enum (
  'training',
  'nutrition',
  'consistency',
  'body',
  'milestone'
);

-- ---------------------------------------------------------------------------
-- xp_events — the ledger
-- ---------------------------------------------------------------------------

create table public.xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        public.xp_kind not null,
  xp          integer not null check (xp >= 0),
  earned_on   date not null,
  -- What it was for, so a point can always be explained.
  context     jsonb not null default '{}'::jsonb,

  -- Distinguishes several awards of the same kind on the same day — the
  -- achievement id, for instance. Empty for kinds that can only fire once.
  dedupe_key  text not null default '',

  created_at  timestamptz not null default now(),

  -- Idempotency lives here rather than in the client. Re-running the award
  -- pass for a day is a no-op, which is what lets it run on every app open.
  unique (user_id, kind, earned_on, dedupe_key)
);

create index xp_events_user_earned on public.xp_events (user_id, earned_on desc);

comment on table public.xp_events is
  'Append-only XP ledger. Total XP is sum(xp), never a stored counter. Rows are not updated or deleted.';

-- ---------------------------------------------------------------------------
-- achievements — reference data
-- ---------------------------------------------------------------------------

create table public.achievements (
  id          text primary key,
  name        text not null,
  description text not null,
  icon        text not null,
  category    public.achievement_category not null,
  -- The metric this thresholds on. Mirrors AchievementMetric in
  -- src/domain/gamification/achievements.ts.
  metric      text not null,
  threshold   integer not null check (threshold > 0),
  xp_reward   integer not null default 0 check (xp_reward >= 0),
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index achievements_category on public.achievements (category, sort_order);

-- ---------------------------------------------------------------------------
-- user_achievements — what was earned, and when
-- ---------------------------------------------------------------------------

create table public.user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_on    date not null default current_date,
  created_at     timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index user_achievements_user on public.user_achievements (user_id, unlocked_on desc);

comment on table public.user_achievements is
  'A record of a moment. Never recomputed: an achievement must not un-unlock because an old log was deleted.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.xp_events         enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;

-- The ledger is insert + read only. No update policy and no delete policy:
-- an append-only table that the client can edit is not append-only.
create policy xp_events_select on public.xp_events
  for select to authenticated using (public.is_owner(user_id));
create policy xp_events_insert on public.xp_events
  for insert to authenticated with check (public.is_owner(user_id));

-- Reference data: readable by anyone signed in, written by the service role.
create policy achievements_select on public.achievements
  for select to authenticated using (true);

-- Likewise unlocks: recorded once, never edited or withdrawn.
create policy user_achievements_select on public.user_achievements
  for select to authenticated using (public.is_owner(user_id));
create policy user_achievements_insert on public.user_achievements
  for insert to authenticated with check (public.is_owner(user_id));
