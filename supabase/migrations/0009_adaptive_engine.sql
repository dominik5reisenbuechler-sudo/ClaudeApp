-- 0009 — Weekly check-ins, recommendations and versioned evidence.
--
-- The shape that matters: a recommendation is a PROPOSAL, not a change. It
-- records what the engine thinks, why, and how confident it is — and nothing
-- happens to the user's targets until they accept it. The engine never silently
-- mutates what someone is eating (ARCHITECTURE.md §4).
--
-- `weekly_checkins.computed` stores a snapshot of the objective inputs used, so
-- a recommendation stays explainable even after the underlying logs change.

create type public.recommendation_type as enum (
  'calorie_adjustment',
  'macro_adjustment',
  'volume_adjustment',
  'deload',
  'exercise_progression',
  'adherence',
  'no_change'
);

create type public.recommendation_status as enum ('pending', 'accepted', 'rejected', 'expired');

create type public.evidence_level as enum ('strong', 'moderate', 'limited', 'mechanistic');

-- ---------------------------------------------------------------------------
-- weekly_checkins
-- ---------------------------------------------------------------------------

create table public.weekly_checkins (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  -- Always a Monday, like meal plans.
  week_start_date      date not null check (extract(isodow from week_start_date) = 1),

  -- Subjective answers, 1–5. Null when skipped: a missing answer is not a 3.
  training_performance smallint check (training_performance between 1 and 5),
  hunger               smallint check (hunger between 1 and 5),
  energy               smallint check (energy between 1 and 5),
  sleep_quality        smallint check (sleep_quality between 1 and 5),
  stress               smallint check (stress between 1 and 5),
  diet_adherence       smallint check (diet_adherence between 1 and 5),
  training_satisfaction smallint check (training_satisfaction between 1 and 5),
  joint_discomfort     smallint check (joint_discomfort between 0 and 4),
  notes                text,

  -- Snapshot of the objective inputs the engine saw at the time.
  computed             jsonb not null default '{}'::jsonb,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index weekly_checkins_user_week on public.weekly_checkins (user_id, week_start_date desc);

create trigger weekly_checkins_set_updated_at
  before update on public.weekly_checkins
  for each row execute function public.set_updated_at();

comment on column public.weekly_checkins.computed is
  'The weight trend, intake, adherence and TDEE estimate used. Kept so a past recommendation can be re-explained in the terms under which it was made.';

-- ---------------------------------------------------------------------------
-- recommendations
-- ---------------------------------------------------------------------------

create table public.recommendations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  weekly_checkin_id uuid references public.weekly_checkins(id) on delete set null,

  type              public.recommendation_type not null,
  -- Shape depends on `type`; both sides stored so the diff is self-describing.
  current_value     jsonb not null default '{}'::jsonb,
  suggested_value   jsonb not null default '{}'::jsonb,

  -- Required, and required to be substantial. An unexplainable recommendation
  -- is a bug, not a feature (CLAUDE.md §44).
  reason            text not null check (length(trim(reason)) >= 20),
  confidence        numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  evidence_rule_ids text[] not null default '{}',

  status            public.recommendation_status not null default 'pending',
  responded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index recommendations_user_status on public.recommendations (user_id, status, created_at desc);
create index recommendations_user_created on public.recommendations (user_id, created_at desc);

create trigger recommendations_set_updated_at
  before update on public.recommendations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- evidence_rules — versionable science
-- ---------------------------------------------------------------------------
-- Scientific defaults live here so they can be revised as data. Previous
-- versions are retained rather than overwritten, so a recommendation made last
-- year stays explainable in the terms that were current then (CLAUDE.md §54).

create table public.evidence_rules (
  id               uuid primary key default gen_random_uuid(),
  category         text not null,
  rule_key         text not null,
  recommendation   text not null,
  minimum_value    numeric(10,3),
  maximum_value    numeric(10,3),
  unit             text,
  evidence_level   public.evidence_level not null,
  confidence       numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_title     text,
  source_url       text,
  publication_year smallint,
  last_reviewed_at date,
  version          smallint not null default 1,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (rule_key, version)
);

-- Exactly one active version per rule.
create unique index evidence_rules_one_active_per_key
  on public.evidence_rules (rule_key)
  where is_active;

create index evidence_rules_category on public.evidence_rules (category, rule_key);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.weekly_checkins  enable row level security;
alter table public.recommendations  enable row level security;
alter table public.evidence_rules   enable row level security;

create policy weekly_checkins_select on public.weekly_checkins
  for select to authenticated using (public.is_owner(user_id));
create policy weekly_checkins_insert on public.weekly_checkins
  for insert to authenticated with check (public.is_owner(user_id));
create policy weekly_checkins_update on public.weekly_checkins
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy weekly_checkins_delete on public.weekly_checkins
  for delete to authenticated using (public.is_owner(user_id));

create policy recommendations_select on public.recommendations
  for select to authenticated using (public.is_owner(user_id));
create policy recommendations_insert on public.recommendations
  for insert to authenticated with check (public.is_owner(user_id));
-- Update only, and only to respond. There is no delete policy: a recommendation
-- the user rejected is part of the record of what the engine advised.
create policy recommendations_update on public.recommendations
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));

-- Evidence rules are reference data: readable by anyone signed in, written by
-- the service role only.
create policy evidence_rules_select on public.evidence_rules
  for select to authenticated using (is_active);
