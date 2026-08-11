-- 0005 — Foods, food entries and saved meals.
--
-- Two shapes here carry most of the design weight:
--
--   * Every macro column except energy is NULLABLE. External product data is
--     routinely incomplete, and a schema that pretends otherwise forces the
--     import path to invent zeros — which then read as "this food has no
--     protein" rather than "we do not know". Energy is required because a food
--     with no energy value cannot be tracked against a calorie target at all.
--
--   * `food_entries` stores a SNAPSHOT of the macros at the moment of logging,
--     not just a pointer to the food. If a food's data is later corrected, the
--     user's history must not silently rewrite itself.

create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type public.food_source as enum ('generic', 'branded', 'user', 'barcode', 'recipe');

-- ---------------------------------------------------------------------------
-- foods
-- ---------------------------------------------------------------------------

create table public.foods (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(trim(name)) > 0),
  brand               text,
  barcode             text,

  -- One serving, in `serving_unit`. Null when the product does not declare one.
  serving_size        numeric(8,2) check (serving_size is null or serving_size > 0),
  serving_unit        text,

  calories_per_100g   numeric(7,2) not null check (calories_per_100g >= 0 and calories_per_100g <= 900),
  protein_per_100g    numeric(6,2) check (protein_per_100g is null or (protein_per_100g >= 0 and protein_per_100g <= 100)),
  carbs_per_100g      numeric(6,2) check (carbs_per_100g is null or (carbs_per_100g >= 0 and carbs_per_100g <= 100)),
  fat_per_100g        numeric(6,2) check (fat_per_100g is null or (fat_per_100g >= 0 and fat_per_100g <= 100)),
  fiber_per_100g      numeric(6,2) check (fiber_per_100g is null or (fiber_per_100g >= 0 and fiber_per_100g <= 100)),
  sugar_per_100g      numeric(6,2) check (sugar_per_100g is null or (sugar_per_100g >= 0 and sugar_per_100g <= 100)),
  sodium_mg_per_100g  numeric(8,2) check (sodium_mg_per_100g is null or sodium_mg_per_100g >= 0),

  source              public.food_source not null default 'user',
  -- `verified` means a human or a trusted dataset confirmed these numbers.
  -- Scanned products start false: barcode databases are crowd-sourced.
  verified            boolean not null default false,
  is_public           boolean not null default false,
  created_by          uuid references auth.users(id) on delete set null,
  -- Provider id, e.g. the Open Food Facts product code. Lets a cached copy be
  -- refreshed later without duplicating the row.
  external_id         text,
  provider            text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.foods.calories_per_100g is
  'Required. A food with no energy value cannot be tracked, so the import path must reject it rather than store a zero.';
comment on column public.foods.verified is
  'False for crowd-sourced barcode data. The UI says so, and lets the user correct it.';

-- One cached row per product per provider, so repeated scans reuse the copy.
create unique index foods_provider_external_id
  on public.foods (provider, external_id)
  where provider is not null and external_id is not null;

create index foods_barcode on public.foods (barcode) where barcode is not null;
create index foods_created_by on public.foods (created_by) where created_by is not null;
-- Trigram index for fuzzy name search ("chikn brest" should still find it).
create index foods_name_trgm on public.foods using gin (name gin_trgm_ops);

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- saved_meals — reusable combinations ("my usual breakfast")
-- ---------------------------------------------------------------------------

create table public.saved_meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  meal_type  public.meal_type,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_meals_user on public.saved_meals (user_id, name);

create trigger saved_meals_set_updated_at
  before update on public.saved_meals
  for each row execute function public.set_updated_at();

create table public.saved_meal_items (
  id            uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals(id) on delete cascade,
  food_id       uuid not null references public.foods(id) on delete cascade,
  quantity_g    numeric(8,2) not null check (quantity_g > 0),
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index saved_meal_items_meal on public.saved_meal_items (saved_meal_id, sort_order);

-- ---------------------------------------------------------------------------
-- food_entries
-- ---------------------------------------------------------------------------

create table public.food_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  logged_on      date not null default current_date,
  meal_type      public.meal_type not null,

  -- At most one source. All three null is a quick-add: macros typed directly.
  food_id        uuid references public.foods(id) on delete set null,
  saved_meal_id  uuid references public.saved_meals(id) on delete set null,
  recipe_id      uuid,  -- FK added in 0006 when recipes exist

  -- What the user actually chose, kept so the entry can be edited later.
  quantity       numeric(8,2) not null check (quantity > 0),
  unit           text not null default 'g',
  /* Label for a quick-add, or a copy of the food name so history stays
     readable even if the food row is deleted. */
  display_name   text not null,

  -- The snapshot. Energy is required; the rest are null when unknown.
  energy_kcal    numeric(8,2) not null check (energy_kcal >= 0),
  protein_g      numeric(7,2) check (protein_g is null or protein_g >= 0),
  carbs_g        numeric(7,2) check (carbs_g is null or carbs_g >= 0),
  fat_g          numeric(7,2) check (fat_g is null or fat_g >= 0),
  fiber_g        numeric(7,2) check (fiber_g is null or fiber_g >= 0),

  sort_order     smallint not null default 0,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint food_entries_single_source check (
    (case when food_id is not null then 1 else 0 end)
    + (case when saved_meal_id is not null then 1 else 0 end)
    + (case when recipe_id is not null then 1 else 0 end) <= 1
  )
);

comment on column public.food_entries.energy_kcal is
  'Snapshot at log time, not a live join. Correcting a food must not silently rewrite what the user ate last month.';

create index food_entries_user_date on public.food_entries (user_id, logged_on desc);
create index food_entries_user_date_meal on public.food_entries (user_id, logged_on, meal_type, sort_order);
create index food_entries_food on public.food_entries (food_id) where food_id is not null;

create trigger food_entries_set_updated_at
  before update on public.food_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- food_favorites
-- ---------------------------------------------------------------------------

create table public.food_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  food_id    uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.foods            enable row level security;
alter table public.saved_meals      enable row level security;
alter table public.saved_meal_items enable row level security;
alter table public.food_entries     enable row level security;
alter table public.food_favorites   enable row level security;

-- foods is shared content: public rows are readable by everyone signed in, and
-- a user's own private foods are readable only by them. Writes are limited to
-- the creator, so nobody can edit the shared catalogue through the app.
create policy foods_select on public.foods
  for select to authenticated
  using (is_public or (created_by is not null and public.is_owner(created_by)));

create policy foods_insert on public.foods
  for insert to authenticated
  with check (created_by is not null and public.is_owner(created_by));

create policy foods_update on public.foods
  for update to authenticated
  using (created_by is not null and public.is_owner(created_by))
  with check (created_by is not null and public.is_owner(created_by));

create policy foods_delete on public.foods
  for delete to authenticated
  using (created_by is not null and public.is_owner(created_by));

create policy saved_meals_select on public.saved_meals
  for select to authenticated using (public.is_owner(user_id));
create policy saved_meals_insert on public.saved_meals
  for insert to authenticated with check (public.is_owner(user_id));
create policy saved_meals_update on public.saved_meals
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy saved_meals_delete on public.saved_meals
  for delete to authenticated using (public.is_owner(user_id));

-- Child rows inherit ownership from the parent rather than duplicating user_id.
create policy saved_meal_items_select on public.saved_meal_items
  for select to authenticated
  using (exists (
    select 1 from public.saved_meals m
    where m.id = saved_meal_id and public.is_owner(m.user_id)
  ));
create policy saved_meal_items_insert on public.saved_meal_items
  for insert to authenticated
  with check (exists (
    select 1 from public.saved_meals m
    where m.id = saved_meal_id and public.is_owner(m.user_id)
  ));
create policy saved_meal_items_update on public.saved_meal_items
  for update to authenticated
  using (exists (
    select 1 from public.saved_meals m
    where m.id = saved_meal_id and public.is_owner(m.user_id)
  ));
create policy saved_meal_items_delete on public.saved_meal_items
  for delete to authenticated
  using (exists (
    select 1 from public.saved_meals m
    where m.id = saved_meal_id and public.is_owner(m.user_id)
  ));

create policy food_entries_select on public.food_entries
  for select to authenticated using (public.is_owner(user_id));
create policy food_entries_insert on public.food_entries
  for insert to authenticated with check (public.is_owner(user_id));
create policy food_entries_update on public.food_entries
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy food_entries_delete on public.food_entries
  for delete to authenticated using (public.is_owner(user_id));

create policy food_favorites_select on public.food_favorites
  for select to authenticated using (public.is_owner(user_id));
create policy food_favorites_insert on public.food_favorites
  for insert to authenticated with check (public.is_owner(user_id));
create policy food_favorites_delete on public.food_favorites
  for delete to authenticated using (public.is_owner(user_id));

-- ---------------------------------------------------------------------------
-- Fuzzy food search
-- ---------------------------------------------------------------------------
-- A function rather than a client-side `ilike`: similarity ranking needs the
-- trigram operator, and pushing it into the database keeps the index in play.
-- security invoker so the caller's RLS policies still apply to every row.

create or replace function public.search_foods(search_term text, max_results integer default 25)
returns setof public.foods
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.foods
  where search_term is not null
    and length(trim(search_term)) > 0
    and (name ilike '%' || search_term || '%' or name % search_term)
  order by
    -- Exact prefix matches first, then trigram similarity.
    (lower(name) like lower(search_term) || '%') desc,
    similarity(name, search_term) desc,
    verified desc,
    name
  limit least(greatest(max_results, 1), 100);
$$;

comment on function public.search_foods is
  'Fuzzy food search. security invoker, so RLS on foods still decides which rows the caller can see.';
