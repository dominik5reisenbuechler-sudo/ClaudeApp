-- 0004 — Body, activity and recovery logs.
--
-- Every table here is a daily log keyed on a `date`, not a `timestamptz`. The
-- day a user weighed in is a human day in their own calendar; routing it
-- through UTC creates off-by-one errors either side of midnight.
--
-- Uniqueness on (user_id, logged_on) is what makes "correct yesterday's
-- weigh-in" an upsert rather than a duplicate row.

-- ---------------------------------------------------------------------------
-- weight_logs
-- ---------------------------------------------------------------------------

create table public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  logged_on  date not null default current_date,
  weight_kg  numeric(5,2) not null check (weight_kg > 20 and weight_kg < 400),
  source     public.log_source not null default 'manual',
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index weight_logs_user_date on public.weight_logs (user_id, logged_on desc);

create trigger weight_logs_set_updated_at
  before update on public.weight_logs
  for each row execute function public.set_updated_at();

comment on table public.weight_logs is
  'Raw daily weigh-ins. Moving averages and trends are DERIVED (src/domain/nutrition/weightTrend.ts), never stored — a stored average goes stale the moment a backdated weigh-in arrives.';

-- ---------------------------------------------------------------------------
-- body_measurements
-- ---------------------------------------------------------------------------

create table public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  site        public.measurement_site not null,
  value_cm    numeric(5,1) not null check (value_cm > 0 and value_cm < 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, measured_on, site)
);

create index body_measurements_user_date on public.body_measurements (user_id, measured_on desc);

create trigger body_measurements_set_updated_at
  before update on public.body_measurements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- step_logs
-- ---------------------------------------------------------------------------

create table public.step_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  logged_on  date not null default current_date,
  steps      integer not null check (steps >= 0 and steps <= 200000),
  source     public.log_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index step_logs_user_date on public.step_logs (user_id, logged_on desc);

create trigger step_logs_set_updated_at
  before update on public.step_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- activity_logs
-- ---------------------------------------------------------------------------
-- Non-step activity (cycling, swimming, sport). Deliberately separate from
-- steps so the energy model can weight them differently and so a wearable's
-- calorie figure never silently becomes the user's food allowance.

create table public.activity_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  logged_on      date not null default current_date,
  activity       text not null,
  minutes        integer not null check (minutes > 0 and minutes <= 1440),
  estimated_kcal integer check (estimated_kcal >= 0),
  source         public.log_source not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index activity_logs_user_date on public.activity_logs (user_id, logged_on desc);

create trigger activity_logs_set_updated_at
  before update on public.activity_logs
  for each row execute function public.set_updated_at();

comment on column public.activity_logs.estimated_kcal is
  'An estimate from a device or a formula. Never added directly to the food allowance — expenditure is calibrated from long-run intake and weight trend instead (CLAUDE.md §40).';

-- ---------------------------------------------------------------------------
-- recovery_logs
-- ---------------------------------------------------------------------------

create table public.recovery_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  logged_on          date not null default current_date,
  sleep_hours        numeric(3,1) check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  sleep_quality      smallint check (sleep_quality between 1 and 5),
  stress             smallint check (stress between 1 and 5),
  motivation         smallint check (motivation between 1 and 5),
  joint_discomfort   smallint check (joint_discomfort between 0 and 4),
  -- muscle id -> 0..4 soreness.
  soreness           jsonb not null default '{}'::jsonb,
  resting_hr         smallint check (resting_hr between 25 and 220),
  hrv_ms             numeric(6,2) check (hrv_ms is null or hrv_ms > 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index recovery_logs_user_date on public.recovery_logs (user_id, logged_on desc);

create trigger recovery_logs_set_updated_at
  before update on public.recovery_logs
  for each row execute function public.set_updated_at();

comment on table public.recovery_logs is
  'Subjective and noisy by nature. Used only for within-person trends and never presented as clinical measurement (CLAUDE.md §42).';

-- ---------------------------------------------------------------------------
-- progress_photos
-- ---------------------------------------------------------------------------
-- Only the storage path is stored here. The bucket is private; the app serves
-- images through short-lived signed URLs.

create table public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  taken_on     date not null default current_date,
  storage_path text not null,
  pose         text,
  created_at   timestamptz not null default now()
);

create index progress_photos_user_date on public.progress_photos (user_id, taken_on desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.weight_logs       enable row level security;
alter table public.body_measurements enable row level security;
alter table public.step_logs         enable row level security;
alter table public.activity_logs     enable row level security;
alter table public.recovery_logs     enable row level security;
alter table public.progress_photos   enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'weight_logs', 'body_measurements', 'step_logs',
    'activity_logs', 'recovery_logs', 'progress_photos'
  ]
  loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (public.is_owner(user_id));',
      target_table);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_owner(user_id));',
      target_table);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));',
      target_table);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_owner(user_id));',
      target_table);
  end loop;
end;
$$;
