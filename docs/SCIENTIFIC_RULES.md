# Scientific Rules

This document records the evidence-based defaults the app ships with, why they
were chosen, and their uncertainty. Numeric rules that drive recommendations are
mirrored into the `evidence_rules` table so they can be revised **as data**,
without a code change (`ARCHITECTURE.md` ADR, `DATABASE_SCHEMA.md` §
`evidence_rules`).

> **Scope note.** This is a fitness application, not medical software. Nothing
> here is diagnosis or treatment. Values are population-level starting points
> that the adaptive engine is expected to move away from as individual data
> accumulates.

---

## 1. Energy expenditure

### 1.1 Basal metabolic rate

**Default equation: Mifflin–St Jeor.**

```
male:   BMR = 10·weight_kg + 6.25·height_cm − 5·age + 5
female: BMR = 10·weight_kg + 6.25·height_cm − 5·age − 161
```

Chosen over Harris–Benedict because it is more accurate in modern populations.
Typical error is roughly ±10 % for an individual — which is precisely why the
initial number is labelled an *estimate* in the UI and superseded by the
adaptive estimator.

**When body-fat percentage is known: Katch–McArdle.**

```
LBM = weight_kg · (1 − bodyfat_pct/100)
BMR = 370 + 21.6 · LBM
```

Preferred when a *reliable* body-fat figure exists, because it removes the
sex/adiposity confound. Self-reported or visually-estimated body fat is not
reliable, so the app only uses this path when the user explicitly marks the
value as measured (DEXA/BIA), and still treats the result as an estimate.

| rule_key | value | evidence |
|---|---|---|
| `bmr.equation.default` | Mifflin–St Jeor | strong |
| `bmr.equation.with_bodyfat` | Katch–McArdle | moderate |

### 1.2 Activity multipliers

Total expenditure is built up rather than taken from a single lifestyle
multiplier, because a single multiplier conflates NEAT, steps and training.

```
TDEE_initial = BMR · base_activity_factor
             + step_energy
             + training_energy
             + cardio_energy
```

**Base activity factor** covers occupation and non-step NEAT only:

| occupation | factor |
|---|---|
| desk | 1.15 |
| light | 1.25 |
| active | 1.35 |
| manual | 1.50 |

**Leisure activity** adds a small additive term on top of the occupation
factor, covering activity a step count does not capture (cycling, swimming,
sport): +0.00 sedentary, +0.03 light, +0.06 moderate, +0.09 high, +0.12 very
high. It is kept deliberately small because it overlaps with the step term, and
double-counting activity is the standard way these estimates run high.

**Step energy** is counted separately, net of what the base factor already
assumes, using ~0.04 kcal per kg bodyweight per 1 000 steps above a 3 000-step
baseline. This is a coarse approximation of walking economy; it is deliberately
conservative.

**Training energy**: ~5 kcal/min for resistance training at typical intensities,
applied to logged/planned session minutes and amortised across the week.

**Confidence: limited.** These multipliers exist only to produce a defensible
day-one number. From day ~14 the adaptive estimator dominates.

| rule_key | range | unit | evidence |
|---|---|---|---|
| `activity.factor.desk` | 1.15 | multiplier | limited |
| `activity.step_energy` | 0.035–0.045 | kcal/kg/1000 steps | limited |
| `activity.resistance_training` | 4–6 | kcal/min | limited |

### 1.3 Adaptive TDEE

The only trustworthy expenditure measurement is the user's own energy balance
over time:

```
TDEE_actual ≈ mean_daily_intake − (Δ_trend_weight_kg · 7700 / days)
```

7 700 kcal/kg is the conventional energy density of body-mass change. It is an
approximation: early weight change is disproportionately glycogen and water, and
tissue composition differs between gain and loss. Consequences for the
implementation:

- **A minimum window of 14 days**; 21+ preferred.
- Weight input is the **trend** (7-day moving average, or an EWMA), never a
  single weigh-in.
- The first ~10 days of any new phase are discounted, because the glycogen/water
  shift on entering a surplus or deficit is not tissue change.

**Confidence score** (0–1) is the product of four sub-scores:

| Component | Full credit at |
|---|---|
| weigh-in density | ≥ 4 weigh-ins/week |
| nutrition logging days | ≥ 6 logged days/week |
| logging completeness | days that look plausibly complete (not a 400 kcal day) |
| window length | ≥ 21 days |

**Confidence gates action, not display.**

| confidence | permitted action |
|---|---|
| < 0.4 | show the estimate, recommend no calorie change |
| 0.4–0.7 | recommend at most ±100 kcal |
| > 0.7 | recommend up to ±200 kcal |

| rule_key | value | evidence |
|---|---|---|
| `tdee.energy_density_kg` | 7700 | kcal/kg | moderate |
| `tdee.min_window_days` | 14 | days | moderate |
| `tdee.preferred_window_days` | 21 | days | moderate |

---

## 2. Calorie targets by goal

Rates are expressed as **% of bodyweight per week**, not absolute kg, because a
0.5 kg/week gain is a very different stimulus at 55 kg than at 110 kg.

| Goal | Rate target (%BW/week) | Initial energy offset |
|---|---|---|
| Lean bulk | +0.25 % to +0.5 % | ≈ +10 % of TDEE, capped at +350 kcal |
| Recomposition | −0.1 % to +0.1 % | maintenance to −5 % |
| Cut | −0.5 % to −1.0 % | ≈ −20 % of TDEE, capped at −750 kcal |
| Maintenance | ±0.1 % | 0 |

| rule_key | range | unit | evidence |
|---|---|---|---|
| `goal.rate_band.lean_bulk` | +0.25 to +0.5 | %BW/week | moderate |
| `goal.rate_band.recomposition` | −0.1 to +0.1 | %BW/week | limited |
| `goal.rate_band.cut` | −1.0 to −0.5 | %BW/week | moderate |
| `goal.rate_band.maintenance` | −0.1 to +0.1 | %BW/week | moderate |

**Lean bulk.** Faster gain does not produce proportionally more muscle; it
produces more fat, which shortens the productive length of the phase.
Advanced trainees should sit at the bottom of the range — realistic muscle gain
is on the order of a few kilograms per *year*, not per month.

**Cut.** The deficit is capped to protect training performance and lean mass.
Larger deficits are viable for higher-body-fat individuals but the app does not
push them there automatically.

**Recomposition.** Most plausible in beginners, returning trainees, and
higher-body-fat individuals. For a lean advanced trainee the app should say so
rather than promise both outcomes at once.

### 2.1 Safety floors — hard limits, not suggestions

The calorie engine **must not** emit a target below the greater of:

- 1 500 kcal (male) / 1 200 kcal (female), and
- 1.1 × estimated BMR.

If the goal maths would go lower, the engine clamps, flags the clamp, and
recommends reducing the *rate* rather than the calories. Additional guards:

- Under-18 users: no deficit recommendations; growth and development
  considerations are outside the app's competence.
- Pregnancy or breastfeeding declared: no deficit; direct to a professional.
- BMI < 18.5: no deficit; surface a supportive message.
- Eating-disorder risk signals: suppress weight-loss framing entirely and
  surface support resources.

| rule_key | value | evidence |
|---|---|---|
| `safety.min_kcal.male` | 1500 | kcal | strong |
| `safety.min_kcal.female` | 1200 | kcal | strong |
| `safety.min_kcal.bmr_multiple` | 1.1 | × BMR | moderate |

### 2.2 Adjustment magnitude

Adjustments are **small and infrequent**: ±100 kcal typical, ±200 kcal maximum,
no more than once per 14 days, and only when the observed rate has missed the
target band for two consecutive weeks with adequate adherence. If adherence is
poor, the correct recommendation is to address adherence — not to move the
target.

The **confidence of the TDEE estimate caps the size of the adjustment**, and
below the gate no adjustment is permitted at all — the estimate is still shown,
because hiding it would be worse, but it does not move anyone's food.

| Confidence | Maximum adjustment |
|---|---|
| < 0.4 | none |
| 0.4 – 0.7 | ±100 kcal |
| > 0.7 | ±200 kcal |

Adherence gate: fewer than **4 logged days per week** over the window means the
observed rate says more about logging than about physiology, and the
recommendation names that instead of moving the target.

| rule_key | value | unit | evidence |
|---|---|---|---|
| `calorie.adjustment_interval` | 14 | days | moderate |
| `calorie.adjustment_max` | 200 | kcal | moderate |
| `tdee.confidence_gate` | 0.4 | 0–1 | mechanistic |
| `adherence.min_logged_days_per_week` | 4 | days/week | mechanistic |
| `safety.block_deficit` | — | — | strong |

---

## 3. Macronutrients

### 3.1 Protein

**Default: 1.6–2.2 g/kg bodyweight/day.** Meta-analytic evidence shows benefits
to resistance-training adaptations plateauing around ~1.6 g/kg, with a
reasonable ceiling near 2.2 g/kg.

Modifiers:

- **Cut:** target the upper end (2.0–2.4 g/kg) — protein needs rise as energy
  falls, for lean-mass retention and satiety.
- **High body fat:** compute from an estimate of lean body mass rather than
  total weight, otherwise the target becomes needlessly high.
- **Vegan diets:** slightly higher target to account for lower typical leucine
  content and digestibility of plant protein sources.

| rule_key | range | unit | evidence |
|---|---|---|---|
| `protein.default` | 1.6–2.2 | g/kg/day | strong |
| `protein.cut` | 2.0–2.4 | g/kg/day | moderate |

### 3.2 Fat

**Floor: 0.6 g/kg/day, and never below 15 % of energy.** Dietary fat is not
reduced merely to make the carbohydrate number look better; adequate intake
matters for hormonal function and fat-soluble vitamin absorption. Default
allocation is ~25–30 % of energy, adjusted to preference.

| rule_key | value | unit | evidence |
|---|---|---|---|
| `fat.minimum_per_kg` | 0.6 | g/kg/day | moderate |
| `fat.minimum_pct_energy` | 15 | % | moderate |

### 3.3 Carbohydrate

The remainder after protein and fat. Carbohydrate is the primary fuel for
resistance training, so in a bulk or high-volume block it takes the surplus;
in a cut it absorbs most of the reduction, down to the fat floor.

### 3.4 Fibre

**14 g per 1 000 kcal**, capped at a practical 50 g/day.

| rule_key | value | unit | evidence |
|---|---|---|---|
| `fiber.per_1000kcal` | 14 | g | moderate |

### 3.5 Rounding

Targets are rounded to values a human can act on: calories to 10 kcal, macros to
5 g. False precision (2 647 kcal, 173.4 g protein) implies an accuracy the
underlying estimates do not have.

---

## 4. Training

### 4.1 Weekly volume

**Starting point: 8–12 hard sets per muscle per week**, counted with fractional
credit for secondary involvement (`exercise_muscles.set_credit`).

Volume is then individualised by response, not escalated on a schedule. More
sets generally produce more growth up to a point, but that point is individual
and bounded by recovery. **A stall is not automatically a volume problem** — it
is at least as often a recovery, adherence, technique, execution-proximity or
energy-availability problem. The engine checks those first.

| Situation | Adjustment |
|---|---|
| Progressing, recovering well, muscle is a priority | +2 sets/week (cap ~20) |
| Progressing, recovery neutral | hold |
| Stalled, recovery poor | reduce volume or deload |
| Stalled, recovery good, adherence good | +2 sets or change exercise selection |

| rule_key | range | unit | evidence |
|---|---|---|---|
| `volume.weekly_sets.start` | 8–12 | sets/muscle/week | strong |
| `volume.weekly_sets.ceiling` | ~20 | sets/muscle/week | limited |
| `volume.frequency` | 2 | sessions/muscle/week | moderate |

Frequency: with weekly volume held equal, spreading it across ≥2 sessions per
muscle is at least as effective as one and usually easier to execute well.

### 4.2 Proximity to failure

Working sets are prescribed at **1–3 RIR**. Sets taken close to failure drive
growth; sets taken *to* failure on every set add disproportionate fatigue and
degrade subsequent set quality, particularly on compounds.

RIR is explained to the user in plain terms:

- **RIR 3** — about three clean reps left.
- **RIR 1** — about one clean rep left.
- **RIR 0** — no further clean rep possible (form, not grinding, is the
  boundary).

Self-reported RIR is systematically over-estimated by novices; the app treats
it as a trend signal, not a measurement.

| rule_key | range | evidence |
|---|---|---|
| `intensity.rir.working_sets` | 1–3 | strong |
| `intensity.rir.isolation_final_set` | 0–2 | moderate |

### 4.3 Load and rep ranges

Hypertrophy is achievable across roughly 5–30 reps when sets are taken close to
failure. Defaults: **compounds 5–10**, **isolation 8–15**, with heavier work
biased to stable movements and higher reps to joint-friendlier isolation.

### 4.4 Progression

**Double progression is the default.** Within a prescribed rep range, add reps
until the top of the range is reached on all sets at the target RIR; then
increase load and return to the bottom of the range.

Load increments: **2.5 kg for lower-body compounds, 1.25–2.5 kg for upper-body
compounds, 1–2 kg (or the smallest available) for isolation.**

Progression is **blocked** when any of the following hold:

- the RIR target was missed badly (reported RIR 0 when 2 was prescribed),
- technique breakdown was flagged,
- pain was reported on the movement,
- performance across the last sessions is unstable rather than trending up.

### 4.5 Rest

| Exercise class | Rest |
|---|---|
| Heavy compound | 2–4 min |
| Accessory compound | 1.5–3 min |
| Isolation | 1–2 min |

Short rest reduces performance on subsequent sets, which reduces the effective
stimulus. Defaults are user-adjustable.

### 4.6 Deload

**Not on a fixed calendar.** A deload is proposed when the evidence points to
accumulated fatigue: performance declining across sessions, session RPE rising
at equal load, repeated failure to progress, persistent joint discomfort,
degraded recovery scores, or sustained low motivation.

Typical form: one week at ~50 % of normal volume with load maintained, or
normal volume at a substantially reduced intensity.

**Two independent signals are required** before a deload is proposed. Any one
of them alone is as likely to be a single rough week, and a week of training is
too expensive to give up on one reading. The exception is joint discomfort
sustained across two or more weeks, which is acted on by itself — waiting for a
second opinion there risks an injury rather than a bad week.

A deload is never proposed within 4 weeks of the last one: without accumulated
work there is nothing to recover from.

| rule_key | value | unit | evidence |
|---|---|---|---|
| `training.deload.evidence_based` | 2 | signals | mechanistic |
| `training.deload.interval_min` | 4 | weeks | mechanistic |
| `training.deload.stalled_weeks` | 2 | weeks | moderate |
| `training.deload.rpe_rise` | 1 | RPE at equal load | limited |
| `training.deload.joint_discomfort` | 2 | weeks | mechanistic |
| `training.deload.recovery` | 0.4 | 0–1 recovery score | limited |
| `training.deload.block_length` | 8 | weeks | limited |
| `training.deload.volume_percent` | 50 | % of normal sets | moderate |

### 4.7 Exercise selection

Exercises are not ranked by EMG amplitude alone — surface EMG measures
activation during a task, not long-run hypertrophy. Selection weighs:

- mechanical tension through a full range of motion,
- loading in the lengthened position where the movement allows,
- stability (can the target muscle be the limiting factor?),
- progression ability (can load be added in small increments?),
- stimulus-to-fatigue ratio,
- joint comfort and individual anatomy,
- **the user's preference and adherence** — a slightly worse exercise done
  consistently beats a better one avoided.

### 4.8 Split selection

| Days/week | Structure |
|---|---|
| 2 | Full Body A/B |
| 3 | Full Body ×3, or Upper/Lower/Full |
| 4 | Upper/Lower ×2 |
| 5 | Upper/Lower/Push/Pull/Legs or hybrid |
| 6 | Push/Pull/Legs ×2 |

Chosen to satisfy the ≥2×/week frequency target within the available days and
session length — not by popularity.

---

## 5. Bodyweight measurement

Daily weight fluctuates by 1–2 kg from hydration, sodium, glycogen, digestive
contents and menstrual-cycle phase. Therefore:

- Recommendations use the **7-day moving average**, never a single reading.
- The 30-day trend contextualises the weekly figure.
- For menstruating users, comparing like-for-like weeks of the cycle is more
  informative than week-over-week.
- The app never reacts to a single weigh-in. Ever.

---

## 6. Recovery

Sleep, stress, soreness, resting heart rate and HRV are collected as
**subjective and noisy** inputs. They are combined into a coarse readiness
signal used to gate volume increases and inform deload timing.

The app does not present a recovery score as a precise physiological
measurement, and says so in the UI. HRV in particular is highly individual and
sensitive to measurement conditions; only within-person trends are meaningful.

---

## 7. Explainability requirement

Every recommendation carries a `reason` composed from the actual inputs. The
pattern:

> "We're increasing your calorie target by 100 kcal because your 7-day average
> bodyweight has been flat for 3 weeks (82.1 → 82.2 kg) while your goal is lean
> bulk, and your nutrition logging adherence has been high (6.4 days/week)."

An unexplainable recommendation is a bug, not a feature.

---

## 8. Revision policy

`evidence_rules` rows are versioned and carry `last_reviewed_at`. When evidence
changes, a new version is inserted and the previous one deactivated — history is
retained so past recommendations remain explainable in the terms under which
they were made. Rules should be reviewed at least annually.

## 9. Indicative source base

The defaults above reflect the mainstream position of the resistance-training
and sports-nutrition literature as of the last review. Concrete citations belong
in the `evidence_rules` rows (`source_title`, `source_url`,
`publication_year`), where they can be updated without a release. Broadly, the
positions drawn on are:

- International Society of Sports Nutrition position stands on protein intake
  and nutrient timing.
- Dose–response meta-analyses of resistance-training volume and hypertrophy.
- Meta-analyses of training-to-failure vs. stopping short of failure.
- Meta-analyses of load/rep-range effects on hypertrophy.
- Predictive-equation validation studies for resting metabolic rate.

Each is to be recorded per-rule rather than as a bibliography here, so that a
rule and its justification cannot drift apart.
