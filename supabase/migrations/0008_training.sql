-- 0008 — Muscles, exercises, plans, sessions, sets and personal records.
--
-- The shape that matters most here is `exercise_muscles`. A bench press trains
-- chest fully, triceps and front delts partially. Encoding that as DATA rather
-- than a constant in code is what lets weekly volume be counted honestly, and
-- lets the numbers be revised without a release (CLAUDE.md §31).
--
-- Sets are the atom of everything downstream: volume, progression, personal
-- records and the adaptive engine all read `exercise_sets`. Nothing derived
-- from them is stored as a source of truth.

create type public.muscle_role as enum ('primary', 'secondary', 'stabilizer');

create type public.set_type as enum (
  'working', 'warmup', 'backoff', 'drop', 'myo_rep', 'amrap'
);

create type public.movement_pattern as enum (
  'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
  'squat', 'hinge', 'lunge', 'carry', 'isolation', 'core'
);

create type public.plan_structure as enum (
  'full_body', 'upper_lower', 'push_pull_legs', 'hybrid'
);

create type public.pr_kind as enum ('estimated_1rm', 'weight_for_reps', 'session_volume');

-- ---------------------------------------------------------------------------
-- muscles — reference data
-- ---------------------------------------------------------------------------

create table public.muscles (
  id                       text primary key check (id ~ '^[a-z_]+$'),
  name                     text not null,
  region                   text not null,
  -- The 8–12 starting band from SCIENTIFIC_RULES.md §4.1, per muscle so small
  -- muscles are not handed the same volume as quads.
  default_weekly_sets_min  smallint not null default 8,
  default_weekly_sets_max  smallint not null default 12,
  sort_order               smallint not null default 0,
  created_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- exercises
-- ---------------------------------------------------------------------------

create table public.exercises (
  id                text primary key check (id ~ '^[a-z0-9_]+$'),
  name              text not null,
  equipment         text not null,
  movement_pattern  public.movement_pattern not null,
  difficulty        public.difficulty not null default 'easy',
  rep_range_min     smallint not null default 8 check (rep_range_min > 0),
  rep_range_max     smallint not null default 12 check (rep_range_max > 0),
  -- Smallest sensible load step for this lift, in kg. A leg press moves in
  -- bigger jumps than a lateral raise, and prescribing 2.5 kg on both is how a
  -- progression engine starts recommending impossible increases.
  load_increment_kg numeric(4,2) not null default 2.5 check (load_increment_kg > 0),
  default_rest_seconds smallint not null default 120,
  instructions      text[] not null default '{}',
  common_mistakes   text[] not null default '{}',
  rom_notes         text,
  -- 1 (low) to 5 (high). Used for stimulus-to-fatigue judgements.
  fatigue_rating    smallint check (fatigue_rating between 1 and 5),
  -- How easily the target muscle can be the limiting factor.
  stability_rating  smallint check (stability_rating between 1 and 5),
  video_url         text,
  is_public         boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint exercises_rep_range_ordered check (rep_range_max >= rep_range_min)
);

create index exercises_pattern on public.exercises (movement_pattern);
create index exercises_equipment on public.exercises (equipment);
create index exercises_name_trgm on public.exercises using gin (name gin_trgm_ops);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- exercise_muscles — the fractional set model
-- ---------------------------------------------------------------------------

create table public.exercise_muscles (
  exercise_id text not null references public.exercises(id) on delete cascade,
  muscle_id   text not null references public.muscles(id) on delete cascade,
  role        public.muscle_role not null,
  -- Typically 1.0 primary / 0.5 secondary / 0.25 stabiliser, but the numbers
  -- are data so they can be revised per exercise without touching code.
  set_credit  numeric(3,2) not null check (set_credit > 0 and set_credit <= 1),
  primary key (exercise_id, muscle_id)
);

create index exercise_muscles_muscle on public.exercise_muscles (muscle_id);

comment on table public.exercise_muscles is
  'Fractional set credits. A bench press credits chest 1.0, triceps 0.5, front delts 0.5 — so weekly volume per muscle reflects what was actually trained.';

-- ---------------------------------------------------------------------------
-- exercise_alternatives — for swapping
-- ---------------------------------------------------------------------------

create table public.exercise_alternatives (
  exercise_id     text not null references public.exercises(id) on delete cascade,
  alternative_id  text not null references public.exercises(id) on delete cascade,
  -- 0–1: how closely the alternative matches target muscles and objective.
  similarity      numeric(3,2) not null default 0.8 check (similarity > 0 and similarity <= 1),
  primary key (exercise_id, alternative_id),
  constraint exercise_alternatives_not_self check (exercise_id <> alternative_id)
);

-- ---------------------------------------------------------------------------
-- workout_plans
-- ---------------------------------------------------------------------------

create table public.workout_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  days_per_week     smallint not null check (days_per_week between 1 and 7),
  structure         public.plan_structure not null,
  generated_by      text not null default 'generator',
  generation_params jsonb not null default '{}'::jsonb,
  started_on        date not null default current_date,
  ended_on          date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint workout_plans_dates_ordered check (ended_on is null or ended_on >= started_on)
);

-- At most one active plan per user, mirroring goals and targets.
create unique index workout_plans_one_active_per_user
  on public.workout_plans (user_id)
  where ended_on is null;

create index workout_plans_user on public.workout_plans (user_id, started_on desc);

create trigger workout_plans_set_updated_at
  before update on public.workout_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workout_days and workout_exercises
-- ---------------------------------------------------------------------------

create table public.workout_days (
  id              uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  day_index       smallint not null check (day_index >= 0 and day_index <= 6),
  name            text not null,
  target_muscles  text[] not null default '{}',
  created_at      timestamptz not null default now(),
  unique (workout_plan_id, day_index)
);

create index workout_days_plan on public.workout_days (workout_plan_id, day_index);

create table public.workout_exercises (
  id              uuid primary key default gen_random_uuid(),
  workout_day_id  uuid not null references public.workout_days(id) on delete cascade,
  exercise_id     text not null references public.exercises(id) on delete restrict,
  sort_order      smallint not null default 0,
  target_sets     smallint not null check (target_sets between 1 and 10),
  target_rep_min  smallint not null check (target_rep_min > 0),
  target_rep_max  smallint not null check (target_rep_max > 0),
  target_rir      smallint not null default 2 check (target_rir between 0 and 5),
  rest_seconds    smallint not null default 120,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint workout_exercises_rep_range_ordered check (target_rep_max >= target_rep_min)
);

create index workout_exercises_day on public.workout_exercises (workout_day_id, sort_order);

create trigger workout_exercises_set_updated_at
  before update on public.workout_exercises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workout_sessions and exercise_sets
-- ---------------------------------------------------------------------------

create table public.workout_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Null for an ad-hoc session logged outside any plan.
  workout_day_id uuid references public.workout_days(id) on delete set null,
  name           text,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  -- Session RPE, 1–10. Subjective and noisy; used only as a trend signal.
  session_rpe    smallint check (session_rpe between 1 and 10),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index workout_sessions_user on public.workout_sessions (user_id, started_at desc);
create index workout_sessions_day on public.workout_sessions (workout_day_id) where workout_day_id is not null;

create trigger workout_sessions_set_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

create table public.exercise_sets (
  id                  uuid primary key default gen_random_uuid(),
  workout_session_id  uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id         text not null references public.exercises(id) on delete restrict,
  set_index           smallint not null check (set_index >= 0),
  weight_kg           numeric(6,2) check (weight_kg is null or weight_kg >= 0),
  reps                smallint check (reps is null or reps >= 0),
  -- Reps in reserve. Null when the user did not report it.
  rir                 smallint check (rir is null or (rir >= 0 and rir <= 10)),
  rpe                 numeric(3,1) check (rpe is null or (rpe >= 1 and rpe <= 10)),
  set_type            public.set_type not null default 'working',
  is_completed        boolean not null default true,
  -- Progression blockers, reported by the user during the set.
  technique_breakdown boolean not null default false,
  pain_reported       boolean not null default false,
  note                text,
  performed_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index exercise_sets_session on public.exercise_sets (workout_session_id, set_index);
create index exercise_sets_exercise on public.exercise_sets (exercise_id, performed_at desc);

create trigger exercise_sets_set_updated_at
  before update on public.exercise_sets
  for each row execute function public.set_updated_at();

comment on column public.exercise_sets.technique_breakdown is
  'Blocks a load increase. Adding weight to a lift that already broke down is how injuries happen (SCIENTIFIC_RULES.md §4.4).';

-- ---------------------------------------------------------------------------
-- personal_records
-- ---------------------------------------------------------------------------

create table public.personal_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  exercise_id     text not null references public.exercises(id) on delete cascade,
  kind            public.pr_kind not null,
  value           numeric(8,2) not null,
  reps            smallint,
  weight_kg       numeric(6,2),
  achieved_on     date not null default current_date,
  exercise_set_id uuid references public.exercise_sets(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index personal_records_user_exercise
  on public.personal_records (user_id, exercise_id, achieved_on desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.muscles                enable row level security;
alter table public.exercises              enable row level security;
alter table public.exercise_muscles       enable row level security;
alter table public.exercise_alternatives  enable row level security;
alter table public.workout_plans          enable row level security;
alter table public.workout_days           enable row level security;
alter table public.workout_exercises      enable row level security;
alter table public.workout_sessions       enable row level security;
alter table public.exercise_sets          enable row level security;
alter table public.personal_records       enable row level security;

-- Reference data: readable by anyone signed in, written only by the service
-- role during seeding.
create policy muscles_select on public.muscles
  for select to authenticated using (true);
create policy exercise_muscles_select on public.exercise_muscles
  for select to authenticated using (true);
create policy exercise_alternatives_select on public.exercise_alternatives
  for select to authenticated using (true);

-- Exercises follow the shared-content pattern: the seeded catalogue plus the
-- user's own additions.
create policy exercises_select on public.exercises
  for select to authenticated
  using (is_public or (created_by is not null and public.is_owner(created_by)));
create policy exercises_insert on public.exercises
  for insert to authenticated
  with check (created_by is not null and public.is_owner(created_by));
create policy exercises_update on public.exercises
  for update to authenticated
  using (created_by is not null and public.is_owner(created_by))
  with check (created_by is not null and public.is_owner(created_by));
create policy exercises_delete on public.exercises
  for delete to authenticated
  using (created_by is not null and public.is_owner(created_by));

create policy workout_plans_select on public.workout_plans
  for select to authenticated using (public.is_owner(user_id));
create policy workout_plans_insert on public.workout_plans
  for insert to authenticated with check (public.is_owner(user_id));
create policy workout_plans_update on public.workout_plans
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy workout_plans_delete on public.workout_plans
  for delete to authenticated using (public.is_owner(user_id));

create policy workout_sessions_select on public.workout_sessions
  for select to authenticated using (public.is_owner(user_id));
create policy workout_sessions_insert on public.workout_sessions
  for insert to authenticated with check (public.is_owner(user_id));
create policy workout_sessions_update on public.workout_sessions
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy workout_sessions_delete on public.workout_sessions
  for delete to authenticated using (public.is_owner(user_id));

create policy personal_records_select on public.personal_records
  for select to authenticated using (public.is_owner(user_id));
create policy personal_records_insert on public.personal_records
  for insert to authenticated with check (public.is_owner(user_id));
create policy personal_records_delete on public.personal_records
  for delete to authenticated using (public.is_owner(user_id));

-- Children inherit ownership through their parent.
create policy workout_days_all on public.workout_days
  for all to authenticated
  using (exists (
    select 1 from public.workout_plans p
    where p.id = workout_plan_id and public.is_owner(p.user_id)
  ))
  with check (exists (
    select 1 from public.workout_plans p
    where p.id = workout_plan_id and public.is_owner(p.user_id)
  ));

create policy workout_exercises_all on public.workout_exercises
  for all to authenticated
  using (exists (
    select 1
    from public.workout_days d
    join public.workout_plans p on p.id = d.workout_plan_id
    where d.id = workout_day_id and public.is_owner(p.user_id)
  ))
  with check (exists (
    select 1
    from public.workout_days d
    join public.workout_plans p on p.id = d.workout_plan_id
    where d.id = workout_day_id and public.is_owner(p.user_id)
  ));

create policy exercise_sets_all on public.exercise_sets
  for all to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = workout_session_id and public.is_owner(s.user_id)
  ))
  with check (exists (
    select 1 from public.workout_sessions s
    where s.id = workout_session_id and public.is_owner(s.user_id)
  ));
