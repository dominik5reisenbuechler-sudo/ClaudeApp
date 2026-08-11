# Database Schema

Postgres via Supabase. Migrations live in `supabase/migrations/` and are applied
in filename order. Seeds live in `supabase/seed/`.

## Conventions

- Primary keys: `uuid` with `default gen_random_uuid()`, except reference tables
  with stable natural keys (`muscles.id`, `exercises.id` use short text slugs).
- Every user-scoped table carries `user_id uuid not null references auth.users(id) on delete cascade`.
- Every table carries `created_at timestamptz not null default now()`. Mutable
  tables also carry `updated_at`, maintained by the `set_updated_at()` trigger.
- Dates the user "owns" (a log day, a plan day) are stored as `date` in the
  user's local reckoning, not as `timestamptz`. A day boundary is a human
  concept; converting it through UTC creates off-by-one bugs at 23:00.
- Money-free, unit-explicit: every numeric quantity column names its unit
  (`weight_kg`, `energy_kcal`, `protein_g`).
- Enumerations are Postgres `enum` types so invalid states are unrepresentable.
- `on delete cascade` from `auth.users` is what makes "delete my account"
  actually delete the data.

## RLS model

1. RLS is **enabled on every table**. A table without a policy denies everything
   — that is the safe default and it is intentional.
2. User-scoped tables get four policies (select/insert/update/delete), all
   `using (auth.uid() = user_id)` and `with check (auth.uid() = user_id)`.
3. Reference tables (`muscles`, `exercises`, `exercise_muscles`,
   `evidence_rules`, `achievements`) are `select`-only to `authenticated`.
   Writes are service-role only (seeding, admin tooling).
4. Shared-content tables (`foods`, `recipes`) are readable when
   `is_public = true` **or** `created_by = auth.uid()`; writable only by the
   creator. This lets a user create a private custom food without leaking it.
5. Child rows inherit their parent's ownership via an `exists (...)` subquery on
   the parent (e.g. `exercise_sets` → `workout_sessions.user_id`). Child tables
   do not duplicate `user_id` where the parent link is mandatory and indexed.

## Enum types

| Type | Values |
|---|---|
| `sex` | `male`, `female` |
| `goal_type` | `lean_bulk`, `recomposition`, `cut`, `maintenance` |
| `activity_level` | `sedentary`, `light`, `moderate`, `high`, `very_high` |
| `occupation_activity` | `desk`, `light`, `active`, `manual` |
| `experience_level` | `beginner`, `intermediate`, `advanced` |
| `training_location` | `commercial_gym`, `home_gym`, `minimal_equipment`, `bodyweight` |
| `diet_type` | `omnivore`, `pescatarian`, `vegetarian`, `vegan`, `halal`, `kosher` |
| `meal_type` | `breakfast`, `lunch`, `dinner`, `snack` |
| `food_source` | `generic`, `branded`, `user`, `barcode`, `recipe` |
| `muscle_role` | `primary`, `secondary`, `stabilizer` |
| `set_type` | `working`, `warmup`, `backoff`, `drop`, `myo_rep`, `amrap` |
| `recommendation_status` | `pending`, `accepted`, `rejected`, `expired` |
| `streak_kind` | `training`, `nutrition`, `protein`, `steps`, `meal_planning` |
| `difficulty` | `easy`, `medium`, `hard` |
| `evidence_level` | `strong`, `moderate`, `limited`, `mechanistic` |

---

## Tables

### Identity & profile

**`profiles`** — 1:1 with `auth.users`. `id` *is* the user id.
`display_name`, `birth_date`, `sex`, `height_cm`, `locale`, `unit_system`
(`metric`/`imperial`), `timezone`, `onboarding_completed_at`,
`accepted_terms_at`, `health_data_consent_at`.

> `birth_date` rather than `age`: age is derived, and a stored age silently
> becomes wrong.

**`user_goals`** — goal history, not a single mutable row.
`user_id`, `goal goal_type`, `target_weight_kg`, `target_rate_pct_per_week`,
`started_on date`, `ended_on date null`. Exactly one open goal per user
(partial unique index on `user_id where ended_on is null`).

**`user_preferences`** — one row per user. Training preferences
(`training_days_per_week`, `preferred_training_days int[]`,
`session_minutes`, `location`, `available_equipment text[]`,
`experience`, `injury_notes`, `muscle_priorities jsonb`) and nutrition
preferences (`diet_type`, `allergens text[]`, `intolerances text[]`,
`disliked_foods text[]`, `preferred_foods text[]`, `meals_per_day`,
`meal_prep_preference`, `max_cook_minutes`, `weekly_food_budget`,
`variety_preference`).

**`user_targets`** — the *accepted* daily targets, versioned.
`user_id`, `energy_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`,
`step_goal`, `basis jsonb` (the inputs and the equation used),
`source` (`onboarding` | `recommendation` | `manual`), `effective_from date`,
`effective_to date null`. Superseding a target closes the old row; nothing is
overwritten, so "why did my target change?" is always answerable.

### Body & activity logs

- **`weight_logs`** — `user_id`, `logged_on date`, `weight_kg`, `note`.
  Unique on `(user_id, logged_on)`.
- **`body_measurements`** — `user_id`, `measured_on date`, `site` (waist, chest,
  arm, thigh, hip, calf), `value_cm`. Unique on `(user_id, measured_on, site)`.
- **`step_logs`** — `user_id`, `logged_on date`, `steps`, `source`
  (`manual` | `healthkit` | `health_connect`). Unique on `(user_id, logged_on)`.
- **`activity_logs`** — non-step cardio/NEAT: `activity`, `minutes`,
  `estimated_kcal`, `source`.
- **`recovery_logs`** — `sleep_hours`, `sleep_quality`, `stress`, `soreness jsonb`
  (muscle → 0-4), `joint_discomfort`, `resting_hr`, `hrv_ms`, `motivation`.
- **`progress_photos`** — `storage_path`, `taken_on`, `pose`. Storage bucket is
  private; access via signed URLs only.

### Nutrition

- **`foods`** — `id`, `name`, `brand`, `barcode`, `serving_size`,
  `serving_unit`, `calories_per_100g`, `protein_per_100g`, `carbs_per_100g`,
  `fat_per_100g`, `fiber_per_100g`, plus nullable `sugar_/sodium_/potassium_`,
  `source food_source`, `verified bool`, `is_public bool`, `created_by`,
  `external_id`, timestamps. **All macro columns except calories are nullable** —
  external product data is routinely incomplete and the schema must say so.
  Index on `barcode`, trigram index on `name`.
- **`food_entries`** — `user_id`, `logged_on date`, `meal_type`, `food_id` /
  `recipe_id` / `saved_meal_id` (exactly one, enforced by check constraint, or
  none for a quick-add), `quantity`, `unit`, and a **denormalised macro
  snapshot** (`energy_kcal`, `protein_g`, …). The snapshot is deliberate: if a
  food's data is later corrected, history must not silently rewrite itself.
- **`saved_meals`** / **`saved_meal_items`** — reusable multi-food combinations.
- **`ingredients`** — canonical ingredient identities for recipes and shopping
  aggregation. `name`, `category` (meat_fish, dairy, eggs, vegetables, fruit,
  carbs, frozen, canned, spices, other), `default_unit`, `density_g_per_ml`,
  `package_sizes numeric[]`, optional `food_id` link for macro lookup.
- **`recipes`** — `title`, `description`, `image_path`, `meal_type`,
  `prep_minutes`, `cook_minutes`, `difficulty`, `servings`, per-serving macros,
  `dietary_tags text[]`, `allergens text[]`, `meal_prep_rating`, `source`,
  `source_url`, `is_public`, `created_by`.
- **`recipe_ingredients`** — `recipe_id`, `ingredient_id`, `quantity`, `unit`,
  `preparation_note`, `is_scalable bool`, `sort_order`.
  `is_scalable = false` marks things that should not scale linearly (a pinch of
  salt, one baking tray of oil).
- **`recipe_instructions`** — ordered steps. Separate table so steps can be
  reordered and referenced without rewriting a text blob.
- **`user_recipe_favorites`** — `(user_id, recipe_id)`.

### Meal planning

- **`meal_plans`** — `user_id`, `week_start_date`, `mode`, `generated_at`,
  `generation_params jsonb`.
- **`meal_plan_days`** — `meal_plan_id`, `day_date`, `day_index 0..6`.
- **`meal_plan_entries`** — `meal_plan_day_id`, `meal_type`, `recipe_id` or
  `saved_meal_id`, `servings`, `sort_order`.
- **`shopping_lists`** — `user_id`, `meal_plan_id`, `generated_at`.
- **`shopping_list_items`** — `shopping_list_id`, `ingredient_id`,
  `quantity`, `unit`, `category`, `is_checked`, `is_manual`,
  `covered_by_pantry numeric`.
- **`pantry_items`** — `user_id`, `ingredient_id`, `quantity`, `unit`,
  `always_in_stock bool` (salt, oil).

### Training

- **`muscles`** — reference. `id` slug (`chest`, `lats`, `upper_back`, `traps`,
  `front_delts`, `side_delts`, `rear_delts`, `biceps`, `triceps`, `forearms`,
  `quads`, `hamstrings`, `glutes`, `adductors`, `abductors`, `calves`, `abs`,
  `lower_back`), `name`, `region`, `default_weekly_sets_min/max`.
- **`exercises`** — reference + user-created. `id`, `name`, `equipment`,
  `movement_pattern`, `difficulty`, `rep_range_min/max`, `instructions text[]`,
  `common_mistakes text[]`, `rom_notes`, `fatigue_rating`, `stability_rating`,
  `video_url`, `is_public`, `created_by`.
- **`exercise_muscles`** — the fractional-set model.
  `(exercise_id, muscle_id, role muscle_role, set_credit numeric)`.
  `set_credit` is typically 1.0 primary, 0.5 secondary, 0.25 stabiliser, but it
  is **data, not a constant in code**.
- **`exercise_alternatives`** — `(exercise_id, alternative_id, similarity)`.
- **`workout_plans`** — `user_id`, `name`, `days_per_week`, `structure`,
  `generated_by` (`generator` | `manual`), `generation_params jsonb`,
  `started_on`, `ended_on`.
- **`workout_days`** — `workout_plan_id`, `day_index`, `name` (`Upper A`),
  `target_muscles text[]`.
- **`workout_exercises`** — `workout_day_id`, `exercise_id`, `sort_order`,
  `target_sets`, `target_rep_min/max`, `target_rir`, `rest_seconds`.
- **`workout_sessions`** — `user_id`, `workout_day_id null`, `started_at`,
  `completed_at`, `session_rpe`, `notes`.
- **`exercise_sets`** — `workout_session_id`, `exercise_id`, `set_index`,
  `weight_kg`, `reps`, `rir`, `rpe`, `set_type`, `is_completed`, `note`,
  `performed_at`. Ownership inherited from the session.
- **`personal_records`** — `user_id`, `exercise_id`, `kind`
  (`1rm_estimated` | `weight_for_reps` | `volume`), `value`, `reps`,
  `achieved_on`, `exercise_set_id`.

### Adaptive engine, gamification, evidence

- **`weekly_checkins`** — `user_id`, `week_start_date`, subjective answers,
  and a `computed jsonb` snapshot of the objective inputs used, so a past
  recommendation can be re-explained even after logs change.
- **`recommendations`** — `user_id`, `type`, `current_value jsonb`,
  `suggested_value jsonb`, `reason text`, `confidence numeric 0..1`,
  `evidence_rule_ids text[]`, `status recommendation_status`, `responded_at`.
- **`evidence_rules`** — versionable science. `id`, `category`, `rule_key`,
  `recommendation`, `minimum_value`, `maximum_value`, `unit`,
  `evidence_level`, `confidence`, `source_title`, `source_url`,
  `publication_year`, `last_reviewed_at`, `version`, `is_active`.
  Unique on `(rule_key, version)`; exactly one active row per `rule_key`.
- **`achievements`** — reference: `id`, `name`, `description`, `icon`,
  `category`, `threshold`, `xp_reward`.
- **`user_achievements`** — `(user_id, achievement_id, unlocked_at, progress)`.
- **`xp_events`** — append-only ledger: `user_id`, `kind`, `xp`, `earned_on`,
  `context jsonb`. Total XP is a sum, never a mutable counter that can drift.
- **`streaks`** — `user_id`, `kind streak_kind`, `current_length`,
  `longest_length`, `last_qualifying_date`. A cache over the logs; rebuildable.

### Compliance

- **`user_consents`** — `user_id`, `kind` (`terms`, `privacy`, `health_data`,
  `analytics`), `granted bool`, `granted_at`, `revoked_at`, `policy_version`.
- **`data_export_requests`** / **`account_deletion_requests`** — GDPR request
  audit trail with `requested_at`, `completed_at`, `status`.

---

## Indexes

Beyond primary keys and the uniqueness constraints above:

- `(user_id, logged_on desc)` on every daily log table — every dashboard and
  trend query is "this user, recent days".
- `(user_id, week_start_date)` on `meal_plans` and `weekly_checkins`.
- `(user_id, status)` on `recommendations` — the dashboard reads pending only.
- `(workout_session_id, set_index)` on `exercise_sets`.
- `(exercise_id, achieved_on desc)` on `personal_records`.
- GIN trigram on `foods.name` and `recipes.title` for search;
  GIN on `recipes.dietary_tags` and `exercises`-adjacent array columns.

## Migration order

| File | Contents |
|---|---|
| `0001_extensions_and_helpers.sql` | `pgcrypto`, `pg_trgm`, `set_updated_at()` trigger fn, `is_owner()` helper |
| `0002_enums.sql` | all enum types |
| `0003_profiles_and_preferences.sql` | `profiles`, `user_goals`, `user_preferences`, `user_targets`, `user_consents`, new-user trigger |
| `0004_body_and_activity_logs.sql` | weight, measurements, steps, activity, recovery, photos |
| `0005_nutrition.sql` | foods, ingredients, food entries, saved meals |
| `0006_recipes.sql` | recipes, ingredients, instructions, favourites |
| `0007_meal_planning.sql` | meal plans, shopping lists, pantry |
| `0008_training.sql` | muscles, exercises, plans, sessions, sets, PRs |
| `0009_adaptive_and_gamification.sql` | check-ins, recommendations, evidence rules, XP, streaks, achievements |
| `0010_gdpr.sql` | export/deletion request tables |

Phase 0 ships `0001`–`0004` (everything onboarding and the dashboard skeleton
need). Later migrations land with the phase that uses them — a table with no
reader is a schema guess, not a schema.

## New-user bootstrap

A `handle_new_user()` trigger on `auth.users` inserts a `profiles` row and an
empty `user_preferences` row so the client never has to distinguish "row
missing" from "field not answered yet". The trigger is `security definer` with
a pinned `search_path`.

## What is intentionally *not* stored

- Age (derived from `birth_date`).
- Daily remaining macros (derived from targets − entries).
- 7-day average weight (derived; a stored average goes stale the moment a
  backdated weigh-in is added).
- Total XP as a column (derived from `xp_events`).
