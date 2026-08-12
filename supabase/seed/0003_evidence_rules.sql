-- 0003 — Evidence rules.
--
-- Every number the recommendation engine uses, with where it came from and how
-- well supported it is. This table is the reason a recommendation can say "we
-- adjusted by 100 kcal because…" and have the "because" survive a change of
-- mind about the science: rules are versioned, and old versions are kept so a
-- recommendation made last year stays explainable in its own terms.
--
-- `evidence_level` is honest rather than flattering:
--   strong       — consistent meta-analytic or replicated trial evidence
--   moderate     — reasonable trial evidence, some inconsistency
--   limited      — sparse, indirect, or highly variable evidence
--   mechanistic  — follows from physiology or from product judgement about
--                  acting on noisy data; not a number a trial produced
--
-- Keep in step with docs/SCIENTIFIC_RULES.md — the rule_keys there are these.

insert into public.evidence_rules
  (category, rule_key, recommendation, minimum_value, maximum_value, unit,
   evidence_level, confidence, source_title, publication_year, last_reviewed_at)
values
  -- --- Energy expenditure -------------------------------------------------
  ('energy', 'bmr.equation.default',
   'Estimate BMR with Mifflin–St Jeor when body-fat percentage is unknown.',
   null, null, null, 'strong', 0.90,
   'Mifflin et al., A new predictive equation for resting energy expenditure in healthy individuals',
   1990, current_date),

  ('energy', 'bmr.equation.with_bodyfat',
   'Use Katch–McArdle when a body-fat estimate is available: it works from lean mass and is more accurate at the extremes.',
   null, null, null, 'moderate', 0.70,
   'Katch & McArdle, Nutrition, Weight Control and Exercise',
   1977, current_date),

  ('energy', 'activity.step_energy',
   'Energy per 1,000 steps, scaled by bodyweight. Wide individual variation; treat as an estimate.',
   0.035, 0.045, 'kcal/kg/1000 steps', 'limited', 0.45,
   null, null, current_date),

  ('energy', 'activity.resistance_training',
   'Energy cost of resistance training. Lower than most trackers report, because rest periods dominate the session.',
   4, 6, 'kcal/min', 'limited', 0.45,
   null, null, current_date),

  -- --- Adaptive TDEE ------------------------------------------------------
  ('tdee', 'tdee.energy_density_kg',
   'Energy equivalent of a kilogram of body-mass change. A mixed-tissue approximation, not fat alone.',
   7700, 7700, 'kcal/kg', 'moderate', 0.65,
   'Wishnofsky, Caloric equivalents of gained or lost weight',
   1958, current_date),

  ('tdee', 'tdee.min_window_days',
   'Minimum days of data before expenditure is estimated from intake and weight change. Shorter windows are dominated by water and glycogen.',
   14, 14, 'days', 'moderate', 0.70,
   null, null, current_date),

  ('tdee', 'tdee.preferred_window_days',
   'Preferred analysis window. Long enough to average out day-to-day noise, short enough to still describe the present.',
   21, 21, 'days', 'moderate', 0.70,
   null, null, current_date),

  ('tdee', 'tdee.confidence_gate',
   'Below this confidence the estimate is shown but never acted on. Confidence gates action, not display.',
   0.4, 0.4, '0–1', 'mechanistic', 0.60,
   null, null, current_date),

  ('tdee', 'adherence.min_logged_days_per_week',
   'Below this, the observed rate of weight change says more about logging than about physiology, and the recommendation should say so.',
   4, 4, 'days/week', 'mechanistic', 0.60,
   null, null, current_date),

  -- --- Goals and calorie targets -----------------------------------------
  ('goal', 'goal.rate_band.lean_bulk',
   'Target rate for a lean bulk. Faster gain does not produce proportionally more muscle — it produces more fat, which shortens the productive length of the phase.',
   0.25, 0.5, '%BW/week', 'moderate', 0.70,
   null, null, current_date),

  ('goal', 'goal.rate_band.cut',
   'Target rate for a cut, capped to protect training performance and lean mass.',
   -1.0, -0.5, '%BW/week', 'moderate', 0.70,
   null, null, current_date),

  ('goal', 'goal.rate_band.recomposition',
   'Recomposition holds weight roughly steady while body composition changes. Most plausible in beginners, returners and higher-body-fat individuals.',
   -0.1, 0.1, '%BW/week', 'limited', 0.50,
   null, null, current_date),

  ('goal', 'goal.rate_band.maintenance',
   'Maintenance: weight held within a band that ordinary fluctuation will not breach.',
   -0.1, 0.1, '%BW/week', 'moderate', 0.75,
   null, null, current_date),

  ('goal', 'calorie.adjustment_interval',
   'Minimum days between calorie changes, so each change has time to show up in the weight trend before the next.',
   14, 14, 'days', 'moderate', 0.70,
   null, null, current_date),

  ('goal', 'calorie.adjustment_max',
   'Largest single calorie adjustment, and only at high confidence. Small and infrequent beats large and reactive.',
   100, 200, 'kcal', 'moderate', 0.70,
   null, null, current_date),

  -- --- Safety -------------------------------------------------------------
  ('safety', 'safety.min_kcal.male',
   'Absolute minimum calorie target the app will recommend for male users.',
   1500, 1500, 'kcal', 'strong', 0.90,
   null, null, current_date),

  ('safety', 'safety.min_kcal.female',
   'Absolute minimum calorie target the app will recommend for female users.',
   1200, 1200, 'kcal', 'strong', 0.90,
   null, null, current_date),

  ('safety', 'safety.min_kcal.bmr_multiple',
   'Calorie targets are never below this multiple of estimated BMR, whichever floor is higher.',
   1.1, 1.1, '× BMR', 'moderate', 0.75,
   null, null, current_date),

  ('safety', 'safety.block_deficit',
   'No calorie deficit is recommended for users who are under 18, pregnant or breastfeeding, below a BMI of 18.5, or who report eating-disorder risk. Direct to a qualified professional instead.',
   null, null, null, 'strong', 0.95,
   null, null, current_date),

  -- --- Macronutrients -----------------------------------------------------
  ('macros', 'protein.default',
   'Daily protein for resistance-training adaptations. Benefits plateau near the bottom of this range; the top is a reasonable ceiling, not a target to chase.',
   1.6, 2.2, 'g/kg/day', 'strong', 0.90,
   'Morton et al., A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength',
   2018, current_date),

  ('macros', 'protein.cut',
   'Protein needs rise as energy falls, for lean-mass retention and satiety.',
   2.0, 2.4, 'g/kg/day', 'moderate', 0.75,
   null, null, current_date),

  ('macros', 'fat.minimum_per_kg',
   'Minimum dietary fat, for hormone production and fat-soluble vitamin absorption.',
   0.6, null, 'g/kg/day', 'moderate', 0.70,
   null, null, current_date),

  ('macros', 'fat.minimum_pct_energy',
   'Minimum dietary fat as a share of energy intake, applied alongside the per-kilogram floor.',
   15, null, '%', 'moderate', 0.70,
   null, null, current_date),

  ('macros', 'fiber.per_1000kcal',
   'Fibre target, scaled to intake rather than fixed — a 3,500 kcal diet needs more than a 1,600 kcal one.',
   14, 14, 'g/1000 kcal', 'moderate', 0.75,
   null, null, current_date),

  -- --- Training volume and intensity --------------------------------------
  ('training', 'volume.weekly_sets.start',
   'Starting weekly hard sets per muscle, counted with fractional credit for secondary involvement. Individualised by response from there, never escalated on a schedule.',
   8, 12, 'sets/muscle/week', 'strong', 0.85,
   null, null, current_date),

  ('training', 'volume.weekly_sets.ceiling',
   'Approximate ceiling beyond which added sets buy fatigue rather than growth. Highly individual; treat as a prompt to look at execution and exercise choice.',
   20, 20, 'sets/muscle/week', 'limited', 0.45,
   null, null, current_date),

  ('training', 'volume.frequency',
   'Minimum sessions per muscle per week. With weekly volume held equal, spreading it is at least as effective as one session and usually easier to execute well.',
   2, 2, 'sessions/muscle/week', 'moderate', 0.75,
   null, null, current_date),

  ('training', 'intensity.rir.working_sets',
   'Proximity to failure for working sets. Close to failure drives growth; every set to failure adds disproportionate fatigue and degrades later sets.',
   1, 3, 'RIR', 'strong', 0.85,
   null, null, current_date),

  ('training', 'intensity.rir.isolation_final_set',
   'Final set of an isolation movement may run closer to failure — the fatigue cost is lower and the stimulus is easier to place.',
   0, 2, 'RIR', 'moderate', 0.70,
   null, null, current_date),

  -- --- Deload -------------------------------------------------------------
  ('training', 'training.deload.evidence_based',
   'Deloads are proposed on evidence of accumulated fatigue, never on a fixed calendar. Two independent signals are required, because any one alone is as likely to be a single rough week.',
   2, 2, 'signals', 'mechanistic', 0.60,
   null, null, current_date),

  ('training', 'training.deload.interval_min',
   'Minimum weeks between deloads. Without accumulated work there is nothing to recover from.',
   4, 4, 'weeks', 'mechanistic', 0.60,
   null, null, current_date),

  ('training', 'training.deload.stalled_weeks',
   'Consecutive weeks without progress that count as a fatigue signal.',
   2, 2, 'weeks', 'moderate', 0.65,
   null, null, current_date),

  ('training', 'training.deload.rpe_rise',
   'Rise in session RPE at comparable load that counts as a fatigue signal. Self-reported and noisy — a trend signal, not a measurement.',
   1, 1, 'RPE', 'limited', 0.45,
   null, null, current_date),

  ('training', 'training.deload.joint_discomfort',
   'Weeks of sustained joint discomfort after which a deload is proposed on its own. Waiting for a second signal here risks an injury rather than a bad week.',
   2, 2, 'weeks', 'mechanistic', 0.70,
   null, null, current_date),

  ('training', 'training.deload.recovery',
   'Recovery score below which under-recovery counts as a fatigue signal. Subjective and coarse by design.',
   0.4, 0.4, '0–1', 'limited', 0.45,
   null, null, current_date),

  ('training', 'training.deload.block_length',
   'Weeks of uninterrupted hard training after which accumulated fatigue is likely regardless of other signals.',
   8, 8, 'weeks', 'limited', 0.50,
   null, null, current_date),

  ('training', 'training.deload.volume_percent',
   'Volume during a deload week, with loads maintained: enough to hold the stimulus and the movement skill, little enough to shed fatigue.',
   50, 50, '% of normal sets', 'moderate', 0.65,
   null, null, current_date),

  -- --- Bodyweight and check-ins -------------------------------------------
  ('bodyweight', 'weight.moving_average_days',
   'Recommendations use the 7-day moving average, never a single reading. Daily weight moves 1–2 kg on hydration, sodium, glycogen and digestive contents alone.',
   7, 7, 'days', 'strong', 0.90,
   null, null, current_date),

  ('checkin', 'checkin.no_change',
   'A week where nothing needs to change is a valid and common outcome. Manufacturing an adjustment to look responsive is how an adaptive system becomes a random one.',
   null, null, null, 'mechanistic', 0.80,
   null, null, current_date)
on conflict (rule_key, version) do nothing;
