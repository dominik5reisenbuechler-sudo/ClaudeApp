-- 0003 — Profile, preferences, goals, targets, consents.
--
-- This is everything onboarding writes. Note two deliberate shapes:
--
--   * `user_goals` and `user_targets` are HISTORIES, not single mutable rows.
--     "Why did my calorie target change in March?" must be answerable, and it
--     cannot be if the previous value was overwritten.
--   * `profiles.id` IS `auth.users.id`. No separate surrogate key, so there is
--     no way for a profile to point at the wrong user.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  display_name            text,
  -- Birth date, not age: a stored age is wrong within a year of being written.
  birth_date              date,
  sex                     public.sex,
  height_cm               numeric(5,1) check (height_cm is null or (height_cm > 50 and height_cm < 260)),
  unit_system             public.unit_system not null default 'metric',
  locale                  text not null default 'en',
  timezone                text not null default 'UTC',
  onboarding_completed_at timestamptz,
  accepted_terms_at       timestamptz,
  health_data_consent_at  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Created automatically by handle_new_user().';
comment on column public.profiles.onboarding_completed_at is
  'Null until onboarding finishes. The root layout routes on this.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_preferences
-- ---------------------------------------------------------------------------
-- One row per user, created alongside the profile so the client never has to
-- distinguish "row missing" from "question not answered yet".

create table public.user_preferences (
  user_id                 uuid primary key references auth.users(id) on delete cascade,

  -- Training
  experience              public.experience_level,
  training_location       public.training_location,
  training_days_per_week  smallint check (training_days_per_week between 0 and 7),
  preferred_training_days smallint[] not null default '{}',   -- ISO weekdays, 1 = Monday
  session_minutes         smallint check (session_minutes between 10 and 240),
  available_equipment     text[] not null default '{}',
  injury_notes            text,
  -- muscle id -> 0..3 priority. jsonb rather than a table because it is always
  -- read and written whole, and the key set is a fixed reference list.
  muscle_priorities       jsonb not null default '{}'::jsonb,

  -- Activity
  activity_level          public.activity_level,
  occupation_activity     public.occupation_activity,
  average_daily_steps     integer check (average_daily_steps between 0 and 60000),
  average_sleep_hours     numeric(3,1) check (average_sleep_hours is null or (average_sleep_hours between 0 and 24)),

  -- Nutrition
  diet_type               public.diet_type,
  allergens               text[] not null default '{}',
  intolerances            text[] not null default '{}',
  disliked_foods          text[] not null default '{}',
  preferred_foods         text[] not null default '{}',
  meals_per_day           smallint check (meals_per_day between 1 and 8),
  meal_prep_preference    public.meal_prep_preference,
  max_cook_minutes        smallint check (max_cook_minutes between 0 and 240),
  weekly_food_budget      numeric(10,2),
  budget_currency         text,
  variety_preference      smallint check (variety_preference between 0 and 3),

  -- Health screening. Drives the safety guards in src/domain/nutrition/safety.ts.
  is_pregnant_or_breastfeeding boolean not null default false,
  has_medical_condition        boolean not null default false,
  medical_condition_notes      text,
  eating_disorder_risk         boolean not null default false,
  reports_acute_symptoms       boolean not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_goals
-- ---------------------------------------------------------------------------

create table public.user_goals (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  goal                    public.goal_type not null,
  target_weight_kg        numeric(5,2),
  target_rate_pct_per_week numeric(4,2),
  started_on              date not null default current_date,
  ended_on                date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint user_goals_dates_ordered check (ended_on is null or ended_on >= started_on)
);

-- At most one open goal per user. A partial unique index expresses this without
-- forbidding the historical rows.
create unique index user_goals_one_open_per_user
  on public.user_goals (user_id)
  where ended_on is null;

create index user_goals_user_started on public.user_goals (user_id, started_on desc);

create trigger user_goals_set_updated_at
  before update on public.user_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_targets
-- ---------------------------------------------------------------------------

create table public.user_targets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  energy_kcal     integer not null check (energy_kcal between 800 and 8000),
  protein_g       integer not null check (protein_g >= 0),
  carbs_g         integer not null check (carbs_g >= 0),
  fat_g           integer not null check (fat_g >= 0),
  fiber_g         integer not null check (fiber_g >= 0),
  step_goal       integer not null default 8000 check (step_goal >= 0),
  -- The full derivation: inputs, equation used, intermediate values. This is
  -- what makes "why is my target 2650?" answerable months later.
  basis           jsonb not null default '{}'::jsonb,
  source          public.target_source not null,
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint user_targets_dates_ordered check (effective_to is null or effective_to >= effective_from)
);

create unique index user_targets_one_active_per_user
  on public.user_targets (user_id)
  where effective_to is null;

create index user_targets_user_effective on public.user_targets (user_id, effective_from desc);

create trigger user_targets_set_updated_at
  before update on public.user_targets
  for each row execute function public.set_updated_at();

comment on column public.user_targets.energy_kcal is
  'Lower bound of 800 is a schema-level backstop only. The real floor is enforced in src/domain/nutrition/safety.ts and is considerably higher.';

-- ---------------------------------------------------------------------------
-- user_consents
-- ---------------------------------------------------------------------------

create table public.user_consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           public.consent_kind not null,
  granted        boolean not null,
  policy_version text not null default '1',
  granted_at     timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index user_consents_user_kind on public.user_consents (user_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------
-- security definer because it writes to public tables while running in the
-- auth schema's context. search_path is pinned to defeat search-path attacks.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Enabled on every table. A table with RLS on and no matching policy denies
-- everything, which is the correct default.

alter table public.profiles         enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_goals       enable row level security;
alter table public.user_targets     enable row level security;
alter table public.user_consents    enable row level security;

-- profiles: keyed on `id`, which is the user id.
create policy profiles_select on public.profiles
  for select to authenticated using (public.is_owner(id));
create policy profiles_insert on public.profiles
  for insert to authenticated with check (public.is_owner(id));
create policy profiles_update on public.profiles
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy profiles_delete on public.profiles
  for delete to authenticated using (public.is_owner(id));

create policy user_preferences_select on public.user_preferences
  for select to authenticated using (public.is_owner(user_id));
create policy user_preferences_insert on public.user_preferences
  for insert to authenticated with check (public.is_owner(user_id));
create policy user_preferences_update on public.user_preferences
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy user_preferences_delete on public.user_preferences
  for delete to authenticated using (public.is_owner(user_id));

create policy user_goals_select on public.user_goals
  for select to authenticated using (public.is_owner(user_id));
create policy user_goals_insert on public.user_goals
  for insert to authenticated with check (public.is_owner(user_id));
create policy user_goals_update on public.user_goals
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy user_goals_delete on public.user_goals
  for delete to authenticated using (public.is_owner(user_id));

create policy user_targets_select on public.user_targets
  for select to authenticated using (public.is_owner(user_id));
create policy user_targets_insert on public.user_targets
  for insert to authenticated with check (public.is_owner(user_id));
create policy user_targets_update on public.user_targets
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy user_targets_delete on public.user_targets
  for delete to authenticated using (public.is_owner(user_id));

create policy user_consents_select on public.user_consents
  for select to authenticated using (public.is_owner(user_id));
create policy user_consents_insert on public.user_consents
  for insert to authenticated with check (public.is_owner(user_id));
-- No update/delete policy: a consent record is an audit trail. Revoking
-- consent inserts a new row rather than editing the old one.
