-- 0007 — Weekly meal plans, shopping lists and the pantry.
--
-- Shapes worth explaining:
--
--   * A plan is `meal_plans` → `meal_plan_days` → `meal_plan_entries`. The day
--     row exists even when empty, so the week grid can render seven columns
--     without the client inventing them.
--
--   * `shopping_list_items` stores the AGGREGATED result, not a live view over
--     the plan. A shopping list is a document you take to a shop: ticking
--     things off must not be undone because the plan changed while you were in
--     the aisle. Regenerating is an explicit action.
--
--   * `pantry_items.always_in_stock` covers salt, oil, spices — things nobody
--     wants on a shopping list every week.

create type public.meal_plan_mode as enum (
  'balanced', 'maximum_variety', 'meal_prep', 'budget',
  'quick_easy', 'high_protein', 'cut_friendly', 'bulk'
);

-- ---------------------------------------------------------------------------
-- meal_plans
-- ---------------------------------------------------------------------------

create table public.meal_plans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  -- Always a Monday. Enforced here so week arithmetic cannot drift.
  week_start_date    date not null check (extract(isodow from week_start_date) = 1),
  name               text,
  mode               public.meal_plan_mode,
  generated_at       timestamptz,
  -- Inputs the generator ran with, so a plan can be explained or reproduced.
  generation_params  jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index meal_plans_user_week on public.meal_plans (user_id, week_start_date desc);

create trigger meal_plans_set_updated_at
  before update on public.meal_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- meal_plan_days
-- ---------------------------------------------------------------------------

create table public.meal_plan_days (
  id            uuid primary key default gen_random_uuid(),
  meal_plan_id  uuid not null references public.meal_plans(id) on delete cascade,
  day_index     smallint not null check (day_index between 0 and 6),
  day_date      date not null,
  created_at    timestamptz not null default now(),
  unique (meal_plan_id, day_index)
);

create index meal_plan_days_plan on public.meal_plan_days (meal_plan_id, day_index);

-- ---------------------------------------------------------------------------
-- meal_plan_entries
-- ---------------------------------------------------------------------------

create table public.meal_plan_entries (
  id                uuid primary key default gen_random_uuid(),
  meal_plan_day_id  uuid not null references public.meal_plan_days(id) on delete cascade,
  meal_type         public.meal_type not null,
  recipe_id         uuid references public.recipes(id) on delete cascade,
  saved_meal_id     uuid references public.saved_meals(id) on delete cascade,
  servings          numeric(5,2) not null default 1 check (servings > 0 and servings <= 20),
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A slot holds a recipe or a saved meal, never both and never neither.
  constraint meal_plan_entries_single_source check (
    (recipe_id is not null)::int + (saved_meal_id is not null)::int = 1
  )
);

create index meal_plan_entries_day on public.meal_plan_entries (meal_plan_day_id, meal_type, sort_order);
create index meal_plan_entries_recipe on public.meal_plan_entries (recipe_id) where recipe_id is not null;

create trigger meal_plan_entries_set_updated_at
  before update on public.meal_plan_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pantry_items
-- ---------------------------------------------------------------------------

create table public.pantry_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  ingredient_id   uuid not null references public.ingredients(id) on delete cascade,
  quantity        numeric(10,2) check (quantity is null or quantity >= 0),
  unit            text,
  -- True for staples: excluded from the shopping list regardless of quantity.
  always_in_stock boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, ingredient_id),
  -- Either you track an amount, or you mark it always stocked. Both null would
  -- be a row that says nothing.
  constraint pantry_items_has_meaning check (always_in_stock or quantity is not null)
);

create index pantry_items_user on public.pantry_items (user_id);

create trigger pantry_items_set_updated_at
  before update on public.pantry_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- shopping_lists
-- ---------------------------------------------------------------------------

create table public.shopping_lists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Null when the list was assembled by hand rather than from a plan.
  meal_plan_id  uuid references public.meal_plans(id) on delete set null,
  name          text,
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index shopping_lists_user on public.shopping_lists (user_id, generated_at desc);
create unique index shopping_lists_one_per_plan
  on public.shopping_lists (meal_plan_id)
  where meal_plan_id is not null;

create trigger shopping_lists_set_updated_at
  before update on public.shopping_lists
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- shopping_list_items
-- ---------------------------------------------------------------------------

create table public.shopping_list_items (
  id                 uuid primary key default gen_random_uuid(),
  shopping_list_id   uuid not null references public.shopping_lists(id) on delete cascade,
  -- Null for a line the user typed in themselves.
  ingredient_id      uuid references public.ingredients(id) on delete set null,
  display_name       text not null,
  category           public.ingredient_category not null default 'other',
  quantity           numeric(10,2) not null check (quantity > 0),
  unit               text not null,
  -- How much the pantry already covered, kept so the line can explain itself.
  covered_by_pantry  numeric(10,2) check (covered_by_pantry is null or covered_by_pantry >= 0),
  is_checked         boolean not null default false,
  is_manual          boolean not null default false,
  sort_order         smallint not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index shopping_list_items_list on public.shopping_list_items (shopping_list_id, category, sort_order);

create trigger shopping_list_items_set_updated_at
  before update on public.shopping_list_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.meal_plans          enable row level security;
alter table public.meal_plan_days      enable row level security;
alter table public.meal_plan_entries   enable row level security;
alter table public.pantry_items        enable row level security;
alter table public.shopping_lists      enable row level security;
alter table public.shopping_list_items enable row level security;

create policy meal_plans_select on public.meal_plans
  for select to authenticated using (public.is_owner(user_id));
create policy meal_plans_insert on public.meal_plans
  for insert to authenticated with check (public.is_owner(user_id));
create policy meal_plans_update on public.meal_plans
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy meal_plans_delete on public.meal_plans
  for delete to authenticated using (public.is_owner(user_id));

create policy pantry_items_select on public.pantry_items
  for select to authenticated using (public.is_owner(user_id));
create policy pantry_items_insert on public.pantry_items
  for insert to authenticated with check (public.is_owner(user_id));
create policy pantry_items_update on public.pantry_items
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy pantry_items_delete on public.pantry_items
  for delete to authenticated using (public.is_owner(user_id));

create policy shopping_lists_select on public.shopping_lists
  for select to authenticated using (public.is_owner(user_id));
create policy shopping_lists_insert on public.shopping_lists
  for insert to authenticated with check (public.is_owner(user_id));
create policy shopping_lists_update on public.shopping_lists
  for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));
create policy shopping_lists_delete on public.shopping_lists
  for delete to authenticated using (public.is_owner(user_id));

-- Children inherit ownership through their parent rather than duplicating
-- user_id, which would let the two disagree.
create policy meal_plan_days_all on public.meal_plan_days
  for all to authenticated
  using (exists (
    select 1 from public.meal_plans p where p.id = meal_plan_id and public.is_owner(p.user_id)
  ))
  with check (exists (
    select 1 from public.meal_plans p where p.id = meal_plan_id and public.is_owner(p.user_id)
  ));

create policy meal_plan_entries_all on public.meal_plan_entries
  for all to authenticated
  using (exists (
    select 1
    from public.meal_plan_days d
    join public.meal_plans p on p.id = d.meal_plan_id
    where d.id = meal_plan_day_id and public.is_owner(p.user_id)
  ))
  with check (exists (
    select 1
    from public.meal_plan_days d
    join public.meal_plans p on p.id = d.meal_plan_id
    where d.id = meal_plan_day_id and public.is_owner(p.user_id)
  ));

create policy shopping_list_items_all on public.shopping_list_items
  for all to authenticated
  using (exists (
    select 1 from public.shopping_lists l
    where l.id = shopping_list_id and public.is_owner(l.user_id)
  ))
  with check (exists (
    select 1 from public.shopping_lists l
    where l.id = shopping_list_id and public.is_owner(l.user_id)
  ));
