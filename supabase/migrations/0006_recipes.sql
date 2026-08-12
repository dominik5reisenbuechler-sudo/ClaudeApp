-- 0006 — Ingredients, recipes, instructions and favourites.
--
-- Three shapes worth explaining:
--
--   * `ingredients` is a canonical list with a category and a default unit.
--     Shopping-list aggregation (phase 5) needs identical ingredients across
--     different recipes to be the same row, which free-text names cannot give.
--
--   * `recipe_ingredients.is_scalable` marks quantities that must NOT scale
--     linearly — a pinch of salt, the oil that greases one tray. Doubling those
--     with the servings produces recipes nobody would cook.
--
--   * Per-serving macros are stored on the recipe rather than derived from the
--     ingredients on every read. They are authored values, verified once; a
--     future job can recompute them from linked foods, but a recipe whose
--     numbers silently change when an ingredient's data is corrected would be
--     worse than one whose numbers are fixed and attributable.

create type public.difficulty as enum ('easy', 'medium', 'hard');

create type public.ingredient_category as enum (
  'meat_fish', 'dairy', 'eggs', 'vegetables', 'fruit',
  'carbs', 'frozen', 'canned', 'spices', 'other'
);

-- ---------------------------------------------------------------------------
-- ingredients
-- ---------------------------------------------------------------------------

create table public.ingredients (
  id               uuid primary key default gen_random_uuid(),
  -- Stable identifier for seeds and for idempotent re-seeding.
  slug             text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name             text not null,
  category         public.ingredient_category not null default 'other',
  default_unit     text not null default 'g',
  -- Needed to convert a volume to a mass when aggregating (phase 5).
  density_g_per_ml numeric(6,3) check (density_g_per_ml is null or density_g_per_ml > 0),
  -- Typical retail pack sizes, for the packaging suggestions in CLAUDE.md §25.
  package_sizes    numeric[] not null default '{}',
  -- Optional link to a food, so a recipe ingredient can carry real macros.
  food_id          uuid references public.foods(id) on delete set null,
  allergens        text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index ingredients_category on public.ingredients (category, name);
create index ingredients_name_trgm on public.ingredients using gin (name gin_trgm_ops);

create trigger ingredients_set_updated_at
  before update on public.ingredients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------

create table public.recipes (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique check (slug is null or slug ~ '^[a-z0-9_]+$'),
  title                 text not null check (length(trim(title)) > 0),
  description           text,
  image_path            text,
  meal_type             public.meal_type not null,

  prep_minutes          smallint not null default 0 check (prep_minutes >= 0 and prep_minutes <= 600),
  cook_minutes          smallint not null default 0 check (cook_minutes >= 0 and cook_minutes <= 600),
  difficulty            public.difficulty not null default 'easy',
  servings              smallint not null check (servings > 0 and servings <= 20),

  -- Per serving. Energy required for the same reason as on `foods`: a recipe
  -- with no calorie figure cannot be logged against a target.
  calories_per_serving  numeric(7,2) not null check (calories_per_serving >= 0),
  protein_per_serving   numeric(6,2) check (protein_per_serving is null or protein_per_serving >= 0),
  carbs_per_serving     numeric(6,2) check (carbs_per_serving is null or carbs_per_serving >= 0),
  fat_per_serving       numeric(6,2) check (fat_per_serving is null or fat_per_serving >= 0),
  fiber_per_serving     numeric(6,2) check (fiber_per_serving is null or fiber_per_serving >= 0),

  dietary_tags          text[] not null default '{}',
  allergens             text[] not null default '{}',
  -- 0–3: how well the recipe survives being cooked ahead and reheated.
  meal_prep_rating      smallint not null default 0 check (meal_prep_rating between 0 and 3),
  -- Rough cost band, 1 (cheap) to 3 (pricey). Used by the budget filter.
  cost_band             smallint not null default 2 check (cost_band between 1 and 3),

  -- Attribution. Original recipes carry 'original'; anything adapted from
  -- elsewhere must name and link its source (CLAUDE.md §16).
  source                text not null default 'original',
  source_url            text,

  is_public             boolean not null default false,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.recipes.source is
  'Attribution. Seeded recipes are original work. Copyrighted recipe text is never copied verbatim; adapted recipes name and link their source.';

create index recipes_meal_type on public.recipes (meal_type, title);
create index recipes_title_trgm on public.recipes using gin (title gin_trgm_ops);
create index recipes_dietary_tags on public.recipes using gin (dietary_tags);
create index recipes_protein on public.recipes (protein_per_serving desc nulls last);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- Now that recipes exist, close the forward reference left in 0005.
alter table public.food_entries
  add constraint food_entries_recipe_id_fkey
  foreign key (recipe_id) references public.recipes(id) on delete set null;

-- ---------------------------------------------------------------------------
-- recipe_ingredients
-- ---------------------------------------------------------------------------

create table public.recipe_ingredients (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references public.recipes(id) on delete cascade,
  ingredient_id     uuid not null references public.ingredients(id) on delete restrict,
  quantity          numeric(8,2) not null check (quantity > 0),
  unit              text not null default 'g',
  preparation_note  text,
  -- False for quantities that do not scale with servings: a pinch of salt, the
  -- oil for one pan, the spices that season a dish rather than fill it.
  is_scalable       boolean not null default true,
  -- Optional ingredients are excluded from the shopping list by default.
  is_optional       boolean not null default false,
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  unique (recipe_id, ingredient_id, preparation_note)
);

create index recipe_ingredients_recipe on public.recipe_ingredients (recipe_id, sort_order);
create index recipe_ingredients_ingredient on public.recipe_ingredients (ingredient_id);

-- ---------------------------------------------------------------------------
-- recipe_instructions
-- ---------------------------------------------------------------------------
-- A table rather than a text blob, so steps can be reordered, referenced and
-- rendered individually without re-parsing prose.

create table public.recipe_instructions (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  step_number smallint not null check (step_number > 0),
  instruction text not null check (length(trim(instruction)) > 0),
  created_at  timestamptz not null default now(),
  unique (recipe_id, step_number)
);

create index recipe_instructions_recipe on public.recipe_instructions (recipe_id, step_number);

-- ---------------------------------------------------------------------------
-- user_recipe_favorites
-- ---------------------------------------------------------------------------

create table public.user_recipe_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.ingredients           enable row level security;
alter table public.recipes               enable row level security;
alter table public.recipe_ingredients    enable row level security;
alter table public.recipe_instructions   enable row level security;
alter table public.user_recipe_favorites enable row level security;

-- Ingredients are reference data: readable by anyone signed in, written only by
-- the service role during seeding.
create policy ingredients_select on public.ingredients
  for select to authenticated using (true);

-- Recipes follow the same shared-content pattern as foods.
create policy recipes_select on public.recipes
  for select to authenticated
  using (is_public or (created_by is not null and public.is_owner(created_by)));

create policy recipes_insert on public.recipes
  for insert to authenticated
  with check (created_by is not null and public.is_owner(created_by));

create policy recipes_update on public.recipes
  for update to authenticated
  using (created_by is not null and public.is_owner(created_by))
  with check (created_by is not null and public.is_owner(created_by));

create policy recipes_delete on public.recipes
  for delete to authenticated
  using (created_by is not null and public.is_owner(created_by));

-- Children are visible exactly when their recipe is.
create policy recipe_ingredients_select on public.recipe_ingredients
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and (r.is_public or (r.created_by is not null and public.is_owner(r.created_by)))
  ));

create policy recipe_ingredients_write on public.recipe_ingredients
  for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.created_by is not null and public.is_owner(r.created_by)
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.created_by is not null and public.is_owner(r.created_by)
  ));

create policy recipe_instructions_select on public.recipe_instructions
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and (r.is_public or (r.created_by is not null and public.is_owner(r.created_by)))
  ));

create policy recipe_instructions_write on public.recipe_instructions
  for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.created_by is not null and public.is_owner(r.created_by)
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.created_by is not null and public.is_owner(r.created_by)
  ));

create policy user_recipe_favorites_select on public.user_recipe_favorites
  for select to authenticated using (public.is_owner(user_id));
create policy user_recipe_favorites_insert on public.user_recipe_favorites
  for insert to authenticated with check (public.is_owner(user_id));
create policy user_recipe_favorites_delete on public.user_recipe_favorites
  for delete to authenticated using (public.is_owner(user_id));
