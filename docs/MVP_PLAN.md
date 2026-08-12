# MVP Plan

Build order is sequential. A phase is not started until the previous phase
type-checks, lints, passes tests, and is actually usable.

**Status legend:** ✅ done · 🚧 in progress · ⬜ not started

---

## Phase 0 — Foundation ✅

**Goal:** a running, typed, testable app shell with real auth and a real
database, and no feature code yet.

- ✅ Expo + TypeScript (strict) project, Expo Router file-based navigation
- ✅ Folder structure per `ARCHITECTURE.md` §3
- ✅ Design tokens (spacing, typography, radii, colour) + light/dark themes
- ✅ Design-system components: Button, Card, StatCard, ProgressBar,
  MacroProgress, Input, NumberInput, SearchInput, ScreenHeader, SectionHeader,
  Screen, Chip, OptionCard, Modal/BottomSheet, EmptyState, LoadingState,
  ErrorState
- ✅ Supabase client, env validation, typed database definitions
- ✅ Auth: sign up, sign in, sign out, forgot password, account deletion path
- ✅ Migrations `0001`–`0004` with RLS on every table
- ✅ Bottom tab navigation with the five sections
- ✅ Vitest + ESLint + typecheck wired to npm scripts
- ✅ Domain layer: energy, macros, weight trend, unit conversion — with tests

**Definition of done:** an account can be created, the session persists across
restarts, RLS denies cross-user reads, and `npm run verify` is green.

---

## Phase 1 — Onboarding ✅

**Goal:** a new user goes from empty profile to a personalised calorie and macro
target derived from documented equations.

- ✅ Multi-step flow with a persisted draft (progress survives app close)
- ✅ 13 steps: welcome → basics → body → activity → experience → equipment →
  schedule → priorities → health → diet → restrictions → goal → review
- ✅ Per-step Zod schemas, shared with React Hook Form
- ✅ Safety screening (age, pregnancy, low BMI, ED-risk signals) surfaced on the
  goal step *before* the choice, not applied silently afterwards
- ✅ Target computation on review: BMR → initial TDEE → goal offset → macros
- ✅ Persist `profiles`, `user_preferences`, `user_goals`, `user_targets`
- ✅ Onboarding gate in the root layout

**Definition of done:** completing onboarding writes four tables and lands the
user on a dashboard showing their own numbers, with the derivation viewable.

---

## Phase 2 — Dashboard foundation ✅

- ✅ Home dashboard showing goal/phase, daily targets, bodyweight + 7-day
  average + trend, steps vs goal, and a "still to do" list
- ✅ Weight logging — one editable entry per day, upserted on
  `(user_id, logged_on)`, with the 7-day average given equal billing to the
  daily reading
- ✅ Manual step entry, with a 7-day average that counts only logged days
- ✅ `summarizeWeight` — assesses the observed rate against the goal's band and
  explains the verdict in the user's terms
- ✅ `summarizeSteps` and `estimatedDailySteps`
- ✅ `buildPendingActions` — the "still to do" list, derived from targets minus
  logs

**Deferred by dependency, not skipped.** The dashboard has slots for two things
that need later phases, and the plumbing is already in place:

| Item | Needs | State today |
|---|---|---|
| Calories/protein consumed | Phase 3 food logging | `NutritionTargetsCard` takes `consumed`; `null` renders the targets as a list rather than bars pinned at zero |
| Today's workout | Phase 6 planner | `buildPendingActions` takes a nullable `workout`; `null` emits no action |
| Streaks | Phase 9 | Not started — belongs with the XP and achievement work |

In `buildPendingActions`, `null` means "this capability does not exist", not
"the user has done nothing". Telling someone to log food before food logging
exists would be a bug, and the tests assert the silence.

**Done:** the dashboard reads only from logs and pure domain functions. There is
no placeholder data in the render path.

---

## Phase 3 — Nutrition ✅

- ✅ `foods` schema with a trigram index and a `search_foods()` function
  (`security invoker`, so RLS still decides visibility)
- ✅ `FoodProvider` interface + Open Food Facts implementation + local cache
  keyed on `(provider, external_id)`
- ✅ Barcode scanner (`expo-camera`), EAN-8/13 and UPC-A, with local check-digit
  validation before any network call
- ✅ Food logging by meal type; quick add; custom foods; favourites; recents
- ✅ Nutrition → Today: consumed / target / remaining for kcal, P, C, F, fibre,
  per meal and per day
- ✅ Nutrition sub-navigation (Today, Recipes, Meal Plan, Shopping List)
- ✅ Dashboard now shows real consumption, closing the loop phase 2 left open
- ✅ Incomplete external data handled explicitly rather than zeroed

**Two decisions worth recording.**

*Unknown is not zero.* Every macro column except energy is nullable, `null`
propagates through scaling and aggregation, and `totalsFor` reports which
nutrients are incomplete so the UI can mark a total as a lower bound. Summing
`null` as `0` would produce a confident, silently-low number — the worst
possible output for a value a user makes decisions against.

*Energy is required.* A food with no energy value cannot be tracked at all, so
the provider mapping fails rather than inventing a zero — and hands back
whatever it salvaged, so the user completes a form instead of typing one from
scratch.

**Deferred:** saved meals have a schema and RLS but no UI yet; they are most
useful alongside recipes, so the builder lands in phase 4.

**Done:** a barcode scan produces a logged entry with a macro snapshot, and a
product missing fibre data logs without crashing or silently zeroing.

---

## Phase 4 — Recipes ✅

- ✅ Recipe schema (`0006`): ingredients, recipes, recipe ingredients,
  instructions, favourites
- ✅ Seed catalogue of 20 recipes across breakfast/lunch/dinner/snack, plus 60
  canonical ingredients — **all recipe text is original work** (`source` records
  it; see `PRODUCT_SPEC.md` §4.4)
- ✅ Discovery UI: ranked recommendations, meal-type rails, search, tag filters
- ✅ Recipe detail with a live servings selector, method, allergen warnings
- ✅ Favourites
- ✅ Portion scaling with non-scalable ingredients honoured
- ✅ Recommendations ranked against remaining daily macros
- ✅ Saved meals (deferred from phase 3): save a logged meal, re-log it in one
  tap

**Three decisions worth recording.**

*Scaling is not multiplication.* `is_scalable = false` marks the pinch of salt
and the oil for one pan — doubling those with the servings produces recipes
nobody would cook. Quantities are also rounded per-unit: 135 g of rice, half a
chicken breast, a quarter teaspoon. And the logged macros come from the exact
factor, never the rounded ingredients, so the kitchen view and the diary entry
cannot disagree.

*Only two things are hard exclusions* — allergens and diet. Disliked foods rank
a recipe down and say so; they never hide it. A user who dislikes olives
occasionally still wants to see the olive recipe.

*Halal and kosher return `unverifiable`.* Certification depends on sourcing and
preparation we have no data for. We exclude what is clearly disqualifying
(pork, alcohol, shellfish) and tell the user we cannot confirm the rest, rather
than claiming a compliance we cannot verify.

**Deferred:** smart scaling (CLAUDE.md §19 — "increase the chicken to hit 60 g
protein") is explicitly optional there, and belongs with the meal planner's
generation logic in phase 5. Recipe images are not seeded; the schema has
`image_path` ready.

**Done:** "620 kcal / 55 g protein remaining" returns a ranked list respecting
diet type, allergens and dislikes, with a stated reason per suggestion.

---

## Phase 5 — Meal planner ✅

- ✅ Schema (`0007`): meal plans, days, entries, pantry, shopping lists and items
- ✅ Week view (Mon–Sun × 4 slots) with add, remove, copy day, copy week, clear
- ✅ Auto-generation across all eight modes, deterministic and explainable
- ✅ Meal-prep mode reuses ingredients and repeats meals on purpose
- ✅ Shopping list with unit-normalised aggregation
- ✅ Aisle grouping, checkboxes, `n / m completed`
- ✅ Pantry subtraction, including `always_in_stock` staples

**Decisions worth recording.**

*Generation excludes disliked foods; browsing only ranks them down.* The
difference is who is choosing. A user scrolling a list can skip the olives; a
generated week puts them on the plan unasked. When nothing else fits, the plan
uses them **and says so** rather than silently overriding the preference. A
test pins both halves.

*Incompatible units are never merged.* 2 pieces + 100 g of the same ingredient
stays two lines. We do not know what one piece weighs, and a guessed conversion
produces a list that is confidently wrong — worse than one that is slightly
verbose. The same caution applies to the pantry: an unconvertible pantry entry
is ignored rather than guessed at, because under-buying means a meal that
cannot be cooked.

*Regenerating the shopping list is explicit.* The list is stored, not derived
live from the plan. Nobody wants their half-ticked list reset because the plan
changed while they were in the shop.

*Ingredient rounding happens once, at the end.* Recipe quantities are summed at
full precision across the week and rounded on the finished line; rounding each
of twenty-one meals first would compound the error.

**Deferred:** drag-to-reorder (the spec says "when practical" — day cards with
add/remove cover the need on a phone); swapping a meal is remove-then-add
rather than a dedicated gesture; package-size suggestions are implemented and
tested (`suggestPackaging`) but not yet surfaced in the UI.

**Done:** 200 g + 180 g + 220 g of chicken across three meals produces one
`Chicken breast — 600 g` line under Meat & Fish.

---

## Phase 6 — Training ✅

- ✅ Schema (`0008`) and seed: 18 muscles, 42 exercises, fractional set credits,
  alternatives
- ✅ Plan generator for 2–6 days, split selection per `SCIENTIFIC_RULES.md` §4.8
- ✅ Workout logger with previous performance, target reps/RIR, set entry
- ✅ Rest timer
- ✅ Double-progression engine with all four blocking conditions
- ✅ Exercise substitution (alternatives seeded and surfaced)
- ✅ Weekly fractional volume per muscle, on the plan screen

**Decisions worth recording.**

*Fractional credits are data.* A bench press credits chest 1.0, triceps 0.5 and
front delts 0.5 — stored in `exercise_muscles`, not hard-coded. Revising them
is an `UPDATE`, not a release. Warm-ups never count: including them would
inflate every number and make the volume guidance meaningless.

*The interesting half of progression is the refusal.* Pain, technique
breakdown, a badly undershot RIR, and unstable performance each block a load
increase, in that priority order, each with its own explanation. A one-off RIR
of 1 against a target of 2 is **not** a block — self-reported RIR is imprecise,
and treating noise as signal would stall everyone permanently.

*Load increments are per exercise.* A leg press moves in 5 kg jumps, a lateral
raise in 1 kg. A single global step is how a progression engine starts
recommending impossible increases.

*The volume ceiling is the honest part.* Priorities add sets, but 20/week caps
it: "everything is a priority" is the same as no priority, and recovery is
finite.

**Deferred:** autoregulation (§36) and the deload engine (§37) need recovery
data across weeks and belong with the adaptive engine in phase 8; session RPE
is already collected for them. Personal records have a table and an
`estimatedOneRepMax` function but no detection job yet — that lands with the
analytics in phase 7.

**Done:** a logged week produces correct fractional weekly set counts per
muscle, and progression is withheld under each documented blocking condition.

---

## Phase 7 — Progress ✅

- ✅ Bodyweight chart: daily scatter, 7-day average, 30-day trend
- ✅ Measurements across six sites
- ✅ Strength progression per exercise, charted as estimated 1RM
- ✅ Personal record detection (deferred from phase 6) across three kinds
- ✅ Weekly fractional volume per muscle, and training consistency
- ✅ `LineChart` / `BarChart` built on `react-native-svg`, following the design
  tokens

**Decisions worth recording.**

*Adherence is measured against the user's own plan.* Someone who trains three
times a week and planned three is at 100%, not 60% of somebody else's five.
Judging one plan by another's standard is how an app makes a consistent user
feel like a failing one. It caps at 100 too: an extra session is a bonus, not
125% adherence.

*A record must be recognisable.* Warm-ups never count, incomplete sets never
count, and equalling a previous best is not a record — announcing one would
cheapen the ones that are real. `weight_for_reps` is tracked per rep count,
because 100 × 5 and 90 × 8 answer different questions.

*Charts are hand-rolled on `react-native-svg`.* The app needs two chart shapes,
both of which must follow the design tokens exactly in light and dark. A
general-purpose charting library brings a theming layer to fight with, for
features this app does not use.

*Estimated 1RM is labelled as an estimate* on screen, and the screen says
explicitly that it describes what was lifted, not muscle size (CLAUDE.md §45).

**Deferred: progress photos.** They need a private storage bucket with its own
policies, an image-picker dependency and an upload flow — and the spec lists
them as optional (§46). `progress_photos` already exists in the schema; the
screen says plainly that the feature is not there rather than hiding it.

---

## Phase 8 — Adaptive engine ⬜

- Adaptive TDEE estimator over a 14–28 day window with confidence scoring
- Weekly check-in flow
- Calorie/macro adjustment recommendations, confidence-gated
- Training volume + deload recommendations
- Explanation strings assembled from the real inputs
- Accept/reject writes a new `user_targets` row

**Done when:** the engine refuses to adjust at low confidence and every emitted
recommendation cites its actual numbers.

---

## Phase 9 — Gamification ⬜

- XP ledger and totals
- Achievements + unlock detection
- Five independent streaks; training streak respects scheduled rest days
- Streak display on the dashboard (deferred here from phase 2, since a training
  streak cannot respect rest days before training plans exist)

---

## Phase 10 — Advanced ⬜

- Apple HealthKit / Google Health Connect behind `HealthProvider`
- AI coach over structured user data, with confirmation before any write
- Smart-scale integrations
- Package-size optimisation for shopping lists

---

## Cross-cutting, not deferrable

These ship with the phase that first touches them, never "later":

- **RLS** on every new table, in the same migration that creates it.
- **Tests** for every new pure function.
- **Safety guards** wherever a number reaches the user as advice.
- **Explanations** attached to every recommendation at the point it is created.
- **Consent + deletion** coverage for every new category of personal data.

## Verification gate

```
npm run verify     # typecheck + lint + test
```

Must be green before a phase is considered complete. A bundle check
(`npx expo export --platform web`) is run at the end of each phase as well —
type checking does not catch a broken import graph or a route conflict.

### Verification record

| Phase | `tsc` | `eslint` | `vitest` | `expo export --platform web` |
|---|---|---|---|---|
| 0 + 1 | clean | clean | 168 tests / 10 files | 20 routes |
| 2 | clean | clean | 211 tests / 13 files | 20 routes |
| 3 | clean | clean | 276 tests / 17 files | 30 routes |
| 4 | clean | clean | 324 tests / 19 files | 32 routes |
| 5 | clean | clean | 371 tests / 21 files | 32 routes |
| 6 | clean | clean | 439 tests / 24 files | 38 routes |
| 7 | clean | clean | 483 tests / 27 files | 42 routes |
