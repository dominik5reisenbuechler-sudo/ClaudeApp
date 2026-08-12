# Architecture

## 1. Stack decisions

| Concern | Choice | Rationale |
|---|---|---|
| App framework | **Expo (SDK 57) + React Native** | One codebase for iOS/Android/web; managed native modules for camera (barcode), health, storage. |
| Language | **TypeScript, `strict: true`** | Domain logic is numeric and safety-relevant; `any` is banned by lint rule. |
| Routing | **Expo Router** (file-based, typed routes) | Route groups map cleanly to auth / onboarding / tabs; deep links come free. |
| Styling | **Design tokens + `StyleSheet` primitives** | See ADR-001. |
| Server state | **TanStack Query v5** | Caching, retries, invalidation, offline-ish behaviour without hand-rolled reducers. |
| Local state | React Context (session, theme) + a persisted onboarding draft | No global store until something actually needs one. |
| Validation | **Zod** | One schema per step, reused for form resolver *and* domain input guards. |
| Forms | **React Hook Form** + `@hookform/resolvers/zod` | Uncontrolled inputs, minimal re-render cost on long onboarding forms. |
| Backend | **Supabase** (Postgres, Auth, RLS, Storage, Edge Functions) | Row Level Security is the right primitive for per-user health data. |
| Tests | **Vitest** | Domain layer is pure TS with zero RN imports, so it needs no native transform and tests run in milliseconds. |
| Lint | **ESLint flat config** (`eslint-config-expo` + `typescript-eslint`) | Standard for the Expo toolchain. |

### ADR-001 — Styling: tokens + StyleSheet instead of NativeWind

The brief allows "NativeWind **or** a maintainable component-based styling
system". We chose the latter.

- The design system is a small, closed set of components (Button, Card,
  StatCard, …). Once those exist, screens compose components — they do not write
  ad-hoc styles — so the ergonomic win of utility classes is small.
- Tokens as plain TS objects are type-checked, importable from tests, and
  usable by non-view code (e.g. chart colour selection).
- One fewer build-time transform (Tailwind + Babel plugin + metro config) in a
  stack that already has Expo Router's own transform.

Trade-off: slightly more verbose component internals. Accepted — verbosity is
contained inside `src/components/ui/**`.

### ADR-002 — The domain layer imports nothing

`src/domain/**` may import only from `src/domain/**`, `src/types/**` and
`zod`. It must never import React, React Native, Expo, Supabase or TanStack
Query. This is enforced by an ESLint `no-restricted-imports` rule.

Consequence: every calculation is testable in isolation, deterministically, and
can later be lifted into an Edge Function or a server-side job without change.

### ADR-003 — External data providers sit behind interfaces

Food data comes from an implementation of `FoodProvider`
(`searchFoods`, `getFoodByBarcode`). Health data comes from an implementation of
`HealthProvider`. Neither the UI nor the domain layer references Open Food
Facts, HealthKit or Health Connect directly. This prevents vendor lock-in and
keeps provider outages from becoming architectural problems.

### ADR-004 — Time and randomness are injected

Pure functions that need "now" take a `now: Date` (or `today: IsoDate`)
parameter. Nothing in `src/domain/**` calls `Date.now()` or `Math.random()`
directly. This is what makes the adaptive engine deterministically testable.

---

## 2. Layering

```
┌──────────────────────────────────────────────────────────┐
│ app/**                    Expo Router routes (thin)      │
├──────────────────────────────────────────────────────────┤
│ src/features/**           screen-level composition       │
│ src/components/**         design system + shared UI      │
├──────────────────────────────────────────────────────────┤
│ src/hooks/**              React glue: queries, mutations │
├──────────────────────────────────────────────────────────┤
│ src/services/**           Supabase repositories          │
│ src/integrations/**       food providers, health, ai     │
├──────────────────────────────────────────────────────────┤
│ src/domain/**             PURE business logic (no I/O)   │
├──────────────────────────────────────────────────────────┤
│ src/types/**  src/lib/**  src/utils/**                   │
└──────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows point downward only. A lower layer never imports a
higher one.

- `src/app/**` — route files. A route should be a handful of lines: read params,
  render a feature component. No business logic, no direct Supabase calls.
  Onboarding is one dynamic route rather than thirteen near-identical files: the
  step order lives in `ONBOARDING_STEPS` and the components in
  `STEP_COMPONENTS`, and the compiler keeps the two in agreement.
- `src/features/**` — one folder per product area (`onboarding`, `nutrition`,
  `training`, …) containing screens and area-specific components.
- `src/hooks/**` — the only place `useQuery`/`useMutation` appear. Hooks call
  services, then hand plain data to domain functions.
- `src/services/**` — repository modules wrapping Supabase table access. Each
  returns typed domain objects, never raw Postgres rows.
- `src/domain/**` — the product. Pure, synchronous, exhaustively tested.
- `src/integrations/**` — adapters to the outside world, behind interfaces.

---

## 3. Folder structure

Routes live under `src/app` (the Expo default), so everything the app owns is
under one directory.

```
src/
  app/
    _layout.tsx               root providers + the single auth/onboarding gate
    (auth)/
      _layout.tsx
      sign-in.tsx  sign-up.tsx  forgot-password.tsx
    (onboarding)/
      _layout.tsx             draft provider + stack options
      [step].tsx              resolves the step from the URL
    (tabs)/
      _layout.tsx             bottom tab bar
      index.tsx               Home
      training.tsx  nutrition.tsx  progress.tsx  profile.tsx

  components/
    ui/                       Button, Card, ProgressBar, MacroProgress, …
    layout/                   Screen, ScreenHeader, SectionHeader
  features/
    onboarding/               step components, draft store, schemas
    auth/
    dashboard/
    checkin/                  scale fields, recommendation + TDEE cards
    gamification/             level card
  domain/
    nutrition/                energy, macros, weightTrend, tdeeEstimator,
                              goalAdjustment, packaging
    coach/                    context assembly + the coach action vocabulary
    health/                   reconciling synced samples with manual logs
    training/                 volume, progression, split generation
    activity/                 steps, activity factors
    progress/                 trends, PRs
    recommendations/          recovery scoring, calorie + training engines,
                              weekly assembly, explanations
    gamification/             xp ledger, streaks, achievement catalogue
  hooks/
  services/                   supabase repositories
  integrations/
    foodProviders/            FoodProvider interface + OpenFoodFacts impl
    health/                   HealthProvider interface + null impl
    ai/                       CoachProvider interface + Edge Function client
  lib/                        supabase client, query client, storage, env
  theme/                      tokens, light/dark palettes, ThemeProvider
  types/                      shared domain + database types
  utils/                      date, number, units

supabase/
  migrations/                 timestamped SQL, applied in order
  seed/                       muscles, exercises, recipes, evidence, achievements
  functions/                  Deno Edge Functions — where API keys live

docs/                         this folder
```

---

## 4. Data flow

### Read path

```
Screen → useX() hook → TanStack Query → service (Supabase)
                                          ↓ typed rows
                                     domain function (pure)
                                          ↓ derived values
                                        Screen
```

Derived values (targets, remaining macros, trends, streaks) are **never stored
denormalised as the source of truth**. They are computed from logs by domain
functions. Where caching is needed for performance, the cache is explicitly
labelled as such and is rebuildable from the logs.

### Write path

```
Screen → RHF + Zod validate → mutation hook → service → Supabase
                                                 ↓
                                        query invalidation
```

### Adaptive loop

Computed on open rather than by a scheduled job. `hooks/useCheckin` reads
14–28 days of `weight_logs`, `food_entries` and `workout_sessions` through
queries that already exist, converts them with pure functions, and hands them
to `domain/recommendations/weeklyCheckin.reviewWeek`. Nothing is written until
the user submits the check-in.

    logs ──▶ tdeeEstimator ──▶ calorieAdjustment ─┐
    logs ──▶ reviewInputs   ──▶ trainingAdjustment ┼─▶ reviewWeek ──▶ recommendations
    check-in answers ──▶ recovery ────────────────┘

An Edge Function was the obvious shape and is the wrong one for now: the
computation is pure, cheap, and depends only on rows the client has already
fetched for other screens. Running it server-side would add a deployment
artefact, a second copy of the rules, and a scheduling story, to save work that
takes milliseconds. It becomes worthwhile when recommendations need to arrive
as a push notification rather than when the user opens the app.

The engine's own restraint is the part worth protecting:

- **Confidence gates action, not display.** The TDEE estimate is always shown;
  below 0.4 confidence it moves nothing.
- **A deload supersedes volume changes**, and at most two muscles change in a
  week — change eight things at once and next week's data cannot attribute the
  result.
- **A recommendation is a proposal.** Accepting writes a *new* `user_targets`
  row; rejecting records the answer and changes nothing. **The engine never
  silently mutates a user's targets**, and nothing is ever deleted.

---

## 5. Authentication & authorisation

- Supabase Auth, email + password for the MVP. Apple/Google sign-in are
  additive later (no schema change needed).
- The session is held by the Supabase client, persisted to
  `AsyncStorage`, auto-refreshed, and exposed via `AuthProvider`.
- `app/_layout.tsx` is the single gate:
  - no session → `(auth)`
  - session but `profiles.onboarding_completed_at is null` → `(onboarding)`
  - otherwise → `(tabs)`
- **Authorisation is enforced in the database, not the client.** Every
  user-scoped table has RLS enabled with `auth.uid() = user_id` policies.
  Reference tables (`muscles`, `exercises`, `evidence_rules`) are read-only to
  authenticated users. See `DATABASE_SCHEMA.md`.

---

## 6. Configuration & secrets

- Public config (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
  lives in `.env`, is read through `src/lib/env.ts`, and is validated with Zod
  at startup so a missing value fails loudly rather than at first request.
- The anon key is publishable by design; it is safe **only because RLS is on**.
- The service-role key is never present in the app bundle. Anything needing it
  belongs in an Edge Function.
- `.env` is git-ignored; `.env.example` documents the required keys.

### Edge Function secrets

The AI coach's model key is the second secret the system has, and it follows the
same rule for the same reason: anything prefixed `EXPO_PUBLIC_` is readable by
anyone who downloads the app, and a key that bills per token cannot be one of
them. So `supabase/functions/coach/` holds it —

```
supabase secrets set ANTHROPIC_API_KEY=...
supabase functions deploy coach
```

— and the function is also where the caller's session is verified and rate
limited, neither of which a client could do to itself. It does *not* decide
anything: the context is assembled by `domain/coach/context.ts` and the reply is
validated by `domain/coach/actions.ts`, both on the client where they are
tested. A second copy of the action vocabulary in Deno would be a second copy to
keep in step.

Without the secret the function returns 503 and the app shows the coach as
switched off. Every other feature works, because the coach is an accelerator for
things the user can already do by hand.

---

## 7. Trust boundaries

Two places take input the app did not produce, and both are treated as hostile
by construction rather than by care:

**External food data** (`integrations/foodProviders`) is validated on the way in
— energy required, macros nullable, barcode check digits verified locally before
a request is made.

**Model output** (`integrations/ai`) is parsed against a closed action schema
before anything is rendered. The coach cannot write: it returns proposals, the
user confirms, the app performs. The vocabulary contains no destructive verb at
all, so prompt injection through a food name or a recipe title has nothing to
reach for. Anything that fails validation is dropped rather than shown, because
letting a user confirm an action means trusting the shape it arrived in.

---

## 8. Error, loading and empty states

`LoadingState`, `ErrorState` and `EmptyState` are design-system components.
Screens must not invent their own spinners or error text. Every query-backed
screen renders exactly one of: loading, error (with retry), empty, or content.

---

## 9. Testing strategy

| Layer | Tool | What is tested |
|---|---|---|
| `src/domain/**` | Vitest | Every exported function, including edge cases and refusal conditions. **Required.** |
| `src/utils/**` | Vitest | Unit conversion, date maths, rounding. **Required.** |
| Services | Vitest + fake client | Row → domain mapping. |
| Components | (later) React Native Testing Library | Design-system invariants. |
| Flows | (later) Maestro/Detox | Onboarding, log a food, log a set. |

CI gate: `npm run typecheck && npm run lint && npm test` must pass before any
merge. The repository is never knowingly left in a broken state.
