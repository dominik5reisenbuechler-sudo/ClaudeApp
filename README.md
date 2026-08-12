# Adaptive Evidence-Based Hypertrophy & Nutrition Coach

A fitness and nutrition app built around a closed feedback loop: what you eat
moves your weight trend, the trend reveals your real energy expenditure, that
changes your targets, and your logged training changes your programme. Every
recommendation is explainable from your own data.

**Status: Phases 0–5 complete** — foundation, onboarding, the dashboard with
weight and step logging, nutrition tracking with barcode scanning, the recipe
system with macro-fit recommendations, and the weekly meal planner with an
aggregated shopping list. See [`docs/MVP_PLAN.md`](docs/MVP_PLAN.md) for what
ships when.

---

## Documentation

| Document | What it covers |
|---|---|
| [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) | What the product is, who it is for, the full feature map |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack decisions and ADRs, layering, data flow, auth, testing strategy |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Tables, enums, indexes, the RLS model, migration order |
| [`docs/SCIENTIFIC_RULES.md`](docs/SCIENTIFIC_RULES.md) | Every number the engine uses, with its rationale and uncertainty |
| [`docs/MVP_PLAN.md`](docs/MVP_PLAN.md) | Build order, phase by phase, with definitions of done |

Read `ARCHITECTURE.md` before adding code. Read `SCIENTIFIC_RULES.md` before
changing any figure that reaches a user as advice.

## Stack

React Native + Expo (SDK 57) · TypeScript (strict) · Expo Router · Supabase
(Postgres, Auth, RLS) · TanStack Query · Zod · React Hook Form · Vitest

## Getting started

```bash
npm install
cp .env.example .env      # fill in your Supabase project URL and anon key
npm start
```

Without a `.env`, the app boots to a configuration screen explaining what is
missing rather than failing silently.

### Database

Apply the migrations in `supabase/migrations/` in filename order, either with
the Supabase CLI (`supabase db push`) or by running each file against your
project. They are ordinary SQL and are idempotent in ordering, not in content —
run them once, in sequence.

Then load `supabase/seed/` for the ingredient and recipe catalogue. Seeds run as
the service role and are safe to re-run.

RLS is enabled on every table in the same migration that creates it. A table
with RLS on and no policy denies everything, which is the intended default.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (domain + utils) |
| `npm run verify` | All three — the gate before any merge |

## How the code is organised

```
src/
  app/            routes (thin — read params, render a feature)
  features/       screen-level composition, one folder per product area
  components/     design system: ui primitives + layout
  hooks/          the only place useQuery/useMutation appear
  services/       Supabase repositories
  domain/         PURE business logic — no React, no I/O, fully tested
  theme/          tokens and the light/dark provider
  types/  utils/  lib/
```

Two rules carry most of the weight:

1. **`src/domain/**` is pure.** No React, no Expo, no Supabase, no `Date.now()`.
   Enforced by an ESLint `no-restricted-imports` rule. This is what makes the
   calorie and training maths deterministically testable, and what will let it
   move server-side unchanged.
2. **Authorisation is in the database.** The anon key in the bundle grants
   nothing on its own; every table is behind `auth.uid() = user_id` policies.
3. **Unknown is not zero.** External food data is routinely incomplete. A
   missing nutrient stays `null` all the way from the provider to the daily
   total, which reports which values are lower bounds rather than presenting a
   silently-low number as exact.

## Testing

Business-critical calculations are unit-tested with deterministic inputs:
BMR and TDEE estimation, macro allocation, safety floors, weight moving
averages and trend, rate-vs-goal assessment, step summarisation, pending-action
derivation, food scaling and daily aggregation, food-data plausibility checks,
barcode check digits, the Open Food Facts mapping, recipe portion scaling,
macro-fit recipe ranking, meal-plan generation across all eight modes, unit
conversion and shopping-list aggregation, date and age arithmetic, and the
onboarding-to-domain mapping.

```bash
npm test
```

## Safety and privacy

This is a fitness app, not medical software. The calorie engine enforces hard
floors and refuses to set a deficit for minors, during pregnancy or
breastfeeding, below a BMI of 18.5, or where eating-disorder risk is declared —
it moves the goal to maintenance and explains why rather than refusing to
function.

Health data is treated as sensitive: consent is explicit, storage is row-level
isolated, and export and deletion are first-class. Nothing is sold.
