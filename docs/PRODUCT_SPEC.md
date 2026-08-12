# Product Specification

**Product:** Adaptive Evidence-Based Hypertrophy & Nutrition Coach
**Working name:** `ClaudeApp` (placeholder)
**Platforms:** iOS, Android (React Native / Expo), Web as a secondary target.

---

## 1. Product thesis

Most fitness apps are either a *workout logger* or a *calorie counter*. Both are
passive record-keepers: the user supplies data, the app stores it, and nothing
changes as a result.

This product is defined by a **closed feedback loop**:

```
nutrition intake
   └─> bodyweight trend
        └─> estimated real-world TDEE
             └─> calorie / macro adjustment
                  └─> training performance
                       └─> recovery signals
                            └─> program adjustment
                                 └─> better recommendations
                                      └─> (loop)
```

The app must become measurably more personalised the longer it is used. Every
recommendation must be **explainable** — the user should always be able to ask
"why?" and get a concrete answer grounded in their own logged data.

### Non-goals

- Medical software. No diagnosis, no treatment claims.
- A social network. No feeds, no follower counts.
- A "shred in 7 days" product. No crash deficits, no manipulative gamification.

---

## 2. Target user

| Segment | Description | Primary need |
|---|---|---|
| Intermediate lifter | 1–5 years training, plateauing | Volume/progression guidance that adapts |
| Physique-focused beginner | <1 year, overwhelmed by conflicting advice | A plan and a calorie target they can trust |
| Recomper | Wants to lose fat without losing strength | Careful calorie/protein targeting + performance monitoring |
| Meal-prep pragmatist | Time-constrained, cooks in batches | Weekly plan + aggregated shopping list |

Common thread: they want to be told *what to train, how to progress, how much to
eat, what to eat, what to buy, and whether the current strategy is working.*

---

## 3. Core value propositions

1. **Adaptive calorie targets.** Initial TDEE is an estimate; the app converges
   on the user's real expenditure from intake + weight-trend data over 14–21+
   days, with an explicit confidence score.
2. **Programme generation that respects recovery.** Splits are chosen from
   available days, session length, equipment and muscle priorities — not from
   popularity.
3. **Progression that is earned.** Double progression driven by logged reps and
   RIR, gated on technique and stability of performance.
4. **Nutrition that is actionable.** "You have 620 kcal and 55 g protein left"
   turns directly into ranked recipe suggestions.
5. **Plan → list → kitchen.** Weekly meal plan produces an aggregated,
   unit-normalised shopping list, minus pantry stock.
6. **Explainability.** Every recommendation carries a reason and a confidence.

---

## 4. Feature map

### 4.1 Navigation

Bottom tabs: **Home · Training · Nutrition · Progress · Profile**

| Tab | Sub-sections |
|---|---|
| Nutrition | Today, Food, Recipes, Meal Plan, Shopping List |
| Training | Current Plan, Workout, Exercises, History, Progress |

### 4.2 Home dashboard

Current goal/phase, calories consumed vs target, protein, steps, today's
workout, bodyweight + 7-day average, active streak, and a "still to do" list of
pending actions.

### 4.3 Nutrition

- Food log across Breakfast / Lunch / Dinner / Snacks.
- Daily totals: calories, protein, carbs, fat, fibre — consumed / target /
  remaining.
- Food sources: generic, branded, user-created, barcode, recipes, saved meals.
- Barcode scanning (EAN/UPC) behind a `FoodProvider` interface (Open Food Facts
  as the first implementation).
- Quick-add calories/macros, favourites, recents.

### 4.4 Recipes

First-class recipe system with categories (meal type) and tags (High Protein,
50 g+ Protein, Cut Friendly, Bulk Friendly, Vegetarian, Vegan, Budget, Under 15
Minutes, Meal Prep, Low Calorie). Portion scaling recalculates ingredient
amounts and per-serving macros. Smart recommendations rank recipes against
*remaining* daily macros, diet type, allergens and disliked foods.

**Content rule:** recipes are original or licensed. Copyrighted recipe text is
never copied verbatim; external sources are attributed and linked.

### 4.5 Meal planner & shopping list

Mon–Sun × {Breakfast, Lunch, Snack, Dinner}. Manual editing (add/remove/swap/
copy meal, copy day, copy week) plus **auto-generate** with modes: Balanced,
Maximum Variety, Meal Prep, Budget, Quick & Easy, High Protein, Cut Friendly,
Bulk. Meal-prep mode deliberately reuses ingredients across days.

Shopping list aggregates identical ingredients with unit normalisation
(500 g + 0.5 kg → 1 kg), groups by category, supports checkboxes and a
`17 / 24 completed` progress readout, and subtracts pantry stock.

### 4.6 Training

Programme generator for 2–6 days/week. Exercise database with primary/secondary
muscles, equipment, movement pattern, rep ranges, cues, common mistakes and
alternatives. Fractional set crediting (bench press credits chest fully,
triceps and front delts partially). Workout logger with previous-performance
reference, target reps, target RIR, and a rest timer. Progression engine
(double progression by default). Autoregulation from post-session soreness,
joint discomfort, sleep and stress. Deload suggested on evidence of accumulated
fatigue, never on a fixed calendar.

### 4.7 Progress & analytics

Bodyweight (daily, 7-day average, 30-day trend), measurements (waist, chest,
arms, thighs, hips, calves), strength/estimated-1RM progression, weekly sets per
muscle, workout consistency, calories/protein/steps adherence, optional photos.

### 4.8 Adaptive engine

Weekly check-in (performance, hunger, energy, sleep, stress, adherence,
satisfaction, joint discomfort) combined with objective data produces a
recommendation set: calorie adjustment, macro adjustment, volume adjustment,
deload, exercise progression, plan change. Adjustments are conservative
(±100 kcal class) and suppressed when confidence is low.

What makes it trustworthy is what it *declines* to do:

- The measured expenditure figure is shown at every confidence level, but below
  0.4 confidence it moves nothing. Confidence gates action, not display.
- Poor logging produces an adherence message, not a new target. Moving a number
  the user was not hitting anyway hides the real problem instead of solving it.
- A rate inside the goal's band is left alone. Chasing the midpoint every week
  would mean changing someone's food for no reason.
- A stall is not automatically a volume problem: adherence, training frequency
  and recovery are checked before more sets are ever proposed.
- Deloads need two independent fatigue signals — with sustained joint discomfort
  the one exception, acted on alone.
- At most two muscles change in a week. Change eight things at once and next
  week's data cannot tell you which one worked.

Every recommendation carries the reasoning that produced it, built from the
user's own numbers, plus the evidence rules it rests on. Accepting one writes a
new target; rejecting it changes nothing. Neither is ever deleted.

### 4.9 Gamification

XP for completed workouts (+100), calorie target (+50), protein target (+50),
steps (+30), weight logged (+10), weekly meal plan (+30), weekly check-in
(+60). Achievements for milestones. Separate streaks for Training, Nutrition,
Protein, Steps and Meal Planning — the **training streak respects scheduled
rest days**.

Three rules keep this from working against the product:

- **A scheduled rest day never breaks a streak.** A streak that resets because
  someone took the rest day their programme prescribed rewards junk volume, and
  is the most common way a fitness app teaches people to overtrain.
- **Nothing unlocks on a direction of travel on the scale** — not weight lost,
  not a body-fat figure, not a goal weight. Rewarding the number itself is the
  mechanic that makes tracking apps harmful for the people most at risk from
  them. The body-related achievements reward *measuring consistently*.
- **Nothing in the adaptive engine reads XP.** Points are encouragement; they
  are never evidence. Paying for a self-reported calorie target rewards the
  number rather than the honesty, so the points are kept away from anything
  that decides what the user eats or trains.

### 4.10 AI coach

Structured-data-grounded assistant answering questions like "should I increase
weight on bench press?" or "am I gaining too fast?".

It is **grounded**: it sees a summary of the last four weeks — targets, intake,
weight trend, weekly sets, recent lifts — and answers from those numbers or says
it cannot. What it does not know is named explicitly in the context, so it has
been told what it must not guess at.

It **cannot change anything**. The coach returns proposed actions; the user
confirms each one; the app performs the write. That is a security boundary, not
a courtesy: a model that can be steered by the text of a food label must not be
able to change what someone eats. Its action vocabulary contains no destructive
verb at all — there is no delete, no clear, no reset — so there is nothing for a
prompt injection to reach for.

The model key lives in an Edge Function, never in the app bundle.

### 4.11 Health app and smart scales

Bodyweight and steps import from Apple Health or Health Connect, behind a
`HealthProvider` interface. **A manual entry always wins**: a sync fills gaps,
never overwrites, and reports what it left alone. Nothing syncs automatically —
the user grants consent, then presses sync, so "when did the app read this" has
an answer.

Smart scales need no separate integration. Withings, Renpho and Eufy write into
the platform health store, so they arrive by this same route, and a hardware
reading is recorded as one rather than as a phone entry.

---

## 5. Goals & phases

| Goal | Calorie stance | Weight-rate target |
|---|---|---|
| Lean Bulk | Controlled surplus | ~0.25–0.5 %/week gain |
| Recomposition | Maintenance to slight deficit | ~0 %/week |
| Cut | Moderate deficit | ~0.5–1.0 %/week loss |
| Maintenance | ≈ estimated expenditure | ~0 %/week |

The active phase is always visible on the dashboard. Concrete numeric rules live
in `SCIENTIFIC_RULES.md` and in the `evidence_rules` table, not in code
comments.

---

## 6. Safety commitments

- Calorie floors enforced; the engine refuses to recommend dangerous targets.
- Special handling for minors, pregnancy, very low bodyweight, eating-disorder
  risk signals, and reports of serious pain, dizziness or chest pain.
- Recovery scores are presented with explicit uncertainty, never as clinical
  measurement.
- Users with relevant medical conditions are pointed to professional advice.

## 7. Privacy commitments

Bodyweight, nutrition, photos and health-integration data are sensitive.
Consent is explicit and revocable, data is minimised, storage is row-level
isolated per user, and export plus full deletion are first-class features.
Sensitive health data is never sold.

---

## 8. Success criteria for the MVP

- A new user completes onboarding and receives a calorie + macro target derived
  from a documented equation, not a hard-coded constant.
- Targets change over weeks in response to logged intake and weight, with a
  stated reason and confidence.
- All business-critical calculations are pure, unit-tested functions in
  `src/domain/**` with no UI imports.

See `MVP_PLAN.md` for the build order and the definition of done per phase.
