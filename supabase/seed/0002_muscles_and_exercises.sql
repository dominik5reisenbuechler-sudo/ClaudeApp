-- Seed: the eighteen-muscle model, the exercise catalogue, and the fractional
-- set credits that connect them.
--
-- Set credits follow the convention in SCIENTIFIC_RULES.md §4.1: 1.0 for a
-- muscle the exercise directly trains through a meaningful range, 0.5 for
-- substantial secondary involvement, 0.25 for stabilising work. They are
-- deliberately data — revising them is an UPDATE, not a release.
--
-- Rep ranges and load increments are per-exercise because they genuinely
-- differ: a leg press moves in 5 kg jumps, a lateral raise in 1 kg, and
-- prescribing the same step on both is how a progression engine starts
-- recommending impossible increases.
--
-- Run as the service role. Re-running is safe.

-- ---------------------------------------------------------------------------
-- Muscles
-- ---------------------------------------------------------------------------

insert into public.muscles (id, name, region, default_weekly_sets_min, default_weekly_sets_max, sort_order) values
  ('chest',       'Chest',        'upper', 10, 16,  0),
  ('lats',        'Lats',         'upper', 10, 16,  1),
  ('upper_back',  'Upper back',   'upper', 10, 16,  2),
  ('traps',       'Traps',        'upper',  6, 12,  3),
  ('front_delts', 'Front delts',  'upper',  6, 10,  4),
  ('side_delts',  'Side delts',   'upper', 10, 18,  5),
  ('rear_delts',  'Rear delts',   'upper',  8, 14,  6),
  ('biceps',      'Biceps',       'upper',  8, 14,  7),
  ('triceps',     'Triceps',      'upper',  8, 14,  8),
  ('forearms',    'Forearms',     'upper',  4,  8,  9),
  ('quads',       'Quads',        'lower', 10, 16, 10),
  ('hamstrings',  'Hamstrings',   'lower',  8, 14, 11),
  ('glutes',      'Glutes',       'lower',  8, 14, 12),
  ('adductors',   'Adductors',    'lower',  4,  8, 13),
  ('abductors',   'Abductors',    'lower',  4,  8, 14),
  ('calves',      'Calves',       'lower',  8, 14, 15),
  ('abs',         'Abs',          'core',   6, 12, 16),
  ('lower_back',  'Lower back',   'core',   4, 10, 17)
on conflict (id) do update
  set name = excluded.name,
      region = excluded.region,
      default_weekly_sets_min = excluded.default_weekly_sets_min,
      default_weekly_sets_max = excluded.default_weekly_sets_max,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Exercises
-- ---------------------------------------------------------------------------

insert into public.exercises
  (id, name, equipment, movement_pattern, difficulty, rep_range_min, rep_range_max,
   load_increment_kg, default_rest_seconds, fatigue_rating, stability_rating, rom_notes)
values
  -- Horizontal push
  ('barbell_bench_press',   'Barbell Bench Press',   'barbell',      'horizontal_push', 'medium', 5, 10, 2.5, 210, 4, 3, 'Touch the chest under control; keep the shoulder blades retracted.'),
  ('dumbbell_bench_press',  'Dumbbell Bench Press',  'dumbbell',     'horizontal_push', 'medium', 6, 12, 2,   180, 3, 3, 'Dumbbells allow a deeper stretch than a barbell at the bottom.'),
  ('incline_dumbbell_press','Incline Dumbbell Press','dumbbell',     'horizontal_push', 'medium', 6, 12, 2,   180, 3, 3, 'A 30° bench biases the upper chest without turning it into a shoulder press.'),
  ('machine_chest_press',   'Machine Chest Press',   'machine',      'horizontal_push', 'easy',   8, 15, 2.5, 150, 2, 5, 'Stable enough to push close to failure safely.'),
  ('push_up',               'Push-Up',               'bodyweight',   'horizontal_push', 'easy',   8, 20, 1,   120, 2, 3, 'Elevate the feet to add difficulty once bodyweight is easy.'),
  ('cable_fly',             'Cable Fly',             'cable',        'isolation',       'easy',  10, 20, 2.5, 120, 2, 4, 'Loads the chest in the lengthened position, which a press does not.'),

  -- Vertical push
  ('overhead_press',        'Overhead Press',        'barbell',      'vertical_push',   'medium', 5, 10, 2.5, 210, 4, 3, 'Keep the ribs down; do not lean back to move the bar.'),
  ('dumbbell_shoulder_press','Dumbbell Shoulder Press','dumbbell',   'vertical_push',   'easy',   8, 12, 2,   180, 3, 3, null),

  -- Horizontal pull
  ('barbell_row',           'Barbell Row',           'barbell',      'horizontal_pull', 'medium', 6, 12, 2.5, 180, 4, 2, 'Torso around 45°; stop when the lower back rounds.'),
  ('dumbbell_row',          'Dumbbell Row',          'dumbbell',     'horizontal_pull', 'easy',   8, 15, 2,   150, 2, 4, 'Supported, so the lats can be the limiting factor.'),
  ('seated_cable_row',      'Seated Cable Row',      'cable',        'horizontal_pull', 'easy',   8, 15, 2.5, 150, 2, 5, 'Let the shoulder blades travel forward at the stretch.'),
  ('chest_supported_row',   'Chest-Supported Row',   'machine',      'horizontal_pull', 'easy',   8, 15, 2.5, 150, 2, 5, 'Removes the lower back from the equation entirely.'),

  -- Vertical pull
  ('pull_up',               'Pull-Up',               'pull_up_bar',  'vertical_pull',   'hard',   5, 12, 2.5, 180, 3, 3, 'Full hang at the bottom; chin clearly over the bar.'),
  ('lat_pulldown',          'Lat Pulldown',          'machine',      'vertical_pull',   'easy',   8, 15, 2.5, 150, 2, 5, 'Easier to load progressively than pull-ups for most people.'),

  -- Squat pattern
  ('back_squat',            'Back Squat',            'barbell',      'squat',           'hard',   5, 10, 2.5, 240, 5, 2, 'Depth to at least parallel, with the knees tracking the toes.'),
  ('front_squat',           'Front Squat',           'barbell',      'squat',           'hard',   5, 10, 2.5, 240, 5, 2, 'More quad-biased than a back squat; limited by upper back.'),
  ('leg_press',             'Leg Press',             'machine',      'squat',           'easy',   8, 15, 5,   180, 3, 5, 'Stable, so quads can be taken close to failure without balance limiting.'),
  ('hack_squat',            'Hack Squat',            'machine',      'squat',           'medium', 8, 12, 5,   180, 4, 5, null),
  ('goblet_squat',          'Goblet Squat',          'dumbbell',     'squat',           'easy',   8, 15, 2,   150, 3, 4, null),

  -- Hinge
  ('romanian_deadlift',     'Romanian Deadlift',     'barbell',      'hinge',           'medium', 6, 12, 2.5, 210, 4, 3, 'Push the hips back; stop where the hamstrings stop lengthening.'),
  ('conventional_deadlift', 'Conventional Deadlift', 'barbell',      'hinge',           'hard',   3,  8, 5,   270, 5, 2, 'High fatigue for the volume; use sparingly alongside squats.'),
  ('seated_leg_curl',       'Seated Leg Curl',       'machine',      'isolation',       'easy',  10, 15, 2.5, 120, 2, 5, 'Trains hamstrings at long muscle lengths, unlike a lying curl.'),
  ('hip_thrust',            'Hip Thrust',            'barbell',      'hinge',           'medium', 8, 15, 5,   180, 3, 4, 'Pause at the top; do not hyperextend the lower back.'),

  -- Lunge
  ('bulgarian_split_squat', 'Bulgarian Split Squat', 'dumbbell',     'lunge',           'medium', 8, 15, 2,   150, 4, 2, null),
  ('walking_lunge',         'Walking Lunge',         'dumbbell',     'lunge',           'medium',10, 20, 2,   150, 3, 2, null),

  -- Shoulders and arms
  ('lateral_raise',         'Lateral Raise',         'dumbbell',     'isolation',       'easy',  12, 20, 1,   90,  1, 4, 'Lead with the elbow; do not swing.'),
  ('cable_lateral_raise',   'Cable Lateral Raise',   'cable',        'isolation',       'easy',  12, 20, 2.5, 90,  1, 5, 'Constant tension through the whole range.'),
  ('reverse_fly',           'Reverse Fly',           'dumbbell',     'isolation',       'easy',  12, 20, 1,   90,  1, 4, null),
  ('face_pull',             'Face Pull',             'cable',        'isolation',       'easy',  12, 20, 2.5, 90,  1, 5, null),
  ('barbell_curl',          'Barbell Curl',          'barbell',      'isolation',       'easy',   8, 12, 1.25,120, 2, 3, null),
  ('dumbbell_curl',         'Dumbbell Curl',         'dumbbell',     'isolation',       'easy',   8, 15, 1,   120, 1, 4, null),
  ('incline_dumbbell_curl', 'Incline Dumbbell Curl', 'dumbbell',     'isolation',       'easy',  10, 15, 1,   120, 2, 4, 'Trains the biceps at a longer muscle length than a standing curl.'),
  ('cable_pushdown',        'Cable Pushdown',        'cable',        'isolation',       'easy',  10, 15, 2.5, 90,  1, 5, null),
  ('overhead_cable_extension','Overhead Cable Extension','cable',    'isolation',       'easy',  10, 15, 2.5, 90,  2, 4, 'Loads the long head of the triceps at length.'),
  ('dip',                   'Dip',                   'dip_station',  'horizontal_push', 'hard',   6, 12, 2.5, 180, 3, 2, null),

  -- Calves, core, accessories
  ('standing_calf_raise',   'Standing Calf Raise',   'machine',      'isolation',       'easy',  10, 20, 2.5, 90,  1, 5, 'Pause at the bottom stretch rather than bouncing.'),
  ('seated_calf_raise',     'Seated Calf Raise',     'machine',      'isolation',       'easy',  12, 20, 2.5, 90,  1, 5, null),
  ('hanging_leg_raise',     'Hanging Leg Raise',     'pull_up_bar',  'core',            'medium',10, 20, 1,   90,  2, 2, null),
  ('cable_crunch',          'Cable Crunch',          'cable',        'core',            'easy',  10, 20, 2.5, 90,  1, 5, null),
  ('plank',                 'Plank',                 'bodyweight',   'core',            'easy',  20, 60, 1,   60,  1, 3, 'Progress by adding time or load, not by arching.'),
  ('back_extension',        'Back Extension',        'bodyweight',   'hinge',           'easy',  10, 20, 2.5, 120, 2, 4, null)
on conflict (id) do update
  set name = excluded.name,
      equipment = excluded.equipment,
      movement_pattern = excluded.movement_pattern,
      rep_range_min = excluded.rep_range_min,
      rep_range_max = excluded.rep_range_max,
      load_increment_kg = excluded.load_increment_kg,
      default_rest_seconds = excluded.default_rest_seconds,
      rom_notes = excluded.rom_notes;

-- ---------------------------------------------------------------------------
-- Fractional set credits
-- ---------------------------------------------------------------------------

delete from public.exercise_muscles;

insert into public.exercise_muscles (exercise_id, muscle_id, role, set_credit) values
  -- Horizontal push: chest full, triceps and front delts substantial.
  ('barbell_bench_press', 'chest', 'primary', 1.0),
  ('barbell_bench_press', 'triceps', 'secondary', 0.5),
  ('barbell_bench_press', 'front_delts', 'secondary', 0.5),
  ('dumbbell_bench_press', 'chest', 'primary', 1.0),
  ('dumbbell_bench_press', 'triceps', 'secondary', 0.5),
  ('dumbbell_bench_press', 'front_delts', 'secondary', 0.5),
  ('incline_dumbbell_press', 'chest', 'primary', 1.0),
  ('incline_dumbbell_press', 'front_delts', 'secondary', 0.5),
  ('incline_dumbbell_press', 'triceps', 'secondary', 0.5),
  ('machine_chest_press', 'chest', 'primary', 1.0),
  ('machine_chest_press', 'triceps', 'secondary', 0.5),
  ('machine_chest_press', 'front_delts', 'secondary', 0.25),
  ('push_up', 'chest', 'primary', 1.0),
  ('push_up', 'triceps', 'secondary', 0.5),
  ('push_up', 'front_delts', 'secondary', 0.25),
  ('push_up', 'abs', 'stabilizer', 0.25),
  ('cable_fly', 'chest', 'primary', 1.0),
  ('dip', 'chest', 'primary', 1.0),
  ('dip', 'triceps', 'primary', 1.0),
  ('dip', 'front_delts', 'secondary', 0.5),

  -- Vertical push
  ('overhead_press', 'front_delts', 'primary', 1.0),
  ('overhead_press', 'side_delts', 'secondary', 0.5),
  ('overhead_press', 'triceps', 'secondary', 0.5),
  ('overhead_press', 'abs', 'stabilizer', 0.25),
  ('dumbbell_shoulder_press', 'front_delts', 'primary', 1.0),
  ('dumbbell_shoulder_press', 'side_delts', 'secondary', 0.5),
  ('dumbbell_shoulder_press', 'triceps', 'secondary', 0.5),

  -- Horizontal pull
  ('barbell_row', 'upper_back', 'primary', 1.0),
  ('barbell_row', 'lats', 'primary', 1.0),
  ('barbell_row', 'biceps', 'secondary', 0.5),
  ('barbell_row', 'rear_delts', 'secondary', 0.5),
  ('barbell_row', 'lower_back', 'stabilizer', 0.25),
  ('dumbbell_row', 'lats', 'primary', 1.0),
  ('dumbbell_row', 'upper_back', 'secondary', 0.5),
  ('dumbbell_row', 'biceps', 'secondary', 0.5),
  ('seated_cable_row', 'upper_back', 'primary', 1.0),
  ('seated_cable_row', 'lats', 'primary', 1.0),
  ('seated_cable_row', 'biceps', 'secondary', 0.5),
  ('seated_cable_row', 'rear_delts', 'secondary', 0.25),
  ('chest_supported_row', 'upper_back', 'primary', 1.0),
  ('chest_supported_row', 'lats', 'secondary', 0.5),
  ('chest_supported_row', 'rear_delts', 'secondary', 0.5),
  ('chest_supported_row', 'biceps', 'secondary', 0.5),

  -- Vertical pull
  ('pull_up', 'lats', 'primary', 1.0),
  ('pull_up', 'upper_back', 'secondary', 0.5),
  ('pull_up', 'biceps', 'secondary', 0.5),
  ('pull_up', 'forearms', 'stabilizer', 0.25),
  ('lat_pulldown', 'lats', 'primary', 1.0),
  ('lat_pulldown', 'upper_back', 'secondary', 0.5),
  ('lat_pulldown', 'biceps', 'secondary', 0.5),

  -- Squat pattern
  ('back_squat', 'quads', 'primary', 1.0),
  ('back_squat', 'glutes', 'primary', 1.0),
  ('back_squat', 'adductors', 'secondary', 0.5),
  ('back_squat', 'lower_back', 'stabilizer', 0.25),
  ('front_squat', 'quads', 'primary', 1.0),
  ('front_squat', 'glutes', 'secondary', 0.5),
  ('front_squat', 'upper_back', 'stabilizer', 0.25),
  ('leg_press', 'quads', 'primary', 1.0),
  ('leg_press', 'glutes', 'secondary', 0.5),
  ('leg_press', 'adductors', 'secondary', 0.25),
  ('hack_squat', 'quads', 'primary', 1.0),
  ('hack_squat', 'glutes', 'secondary', 0.5),
  ('goblet_squat', 'quads', 'primary', 1.0),
  ('goblet_squat', 'glutes', 'secondary', 0.5),

  -- Hinge
  ('romanian_deadlift', 'hamstrings', 'primary', 1.0),
  ('romanian_deadlift', 'glutes', 'primary', 1.0),
  ('romanian_deadlift', 'lower_back', 'secondary', 0.5),
  ('romanian_deadlift', 'forearms', 'stabilizer', 0.25),
  ('conventional_deadlift', 'hamstrings', 'primary', 1.0),
  ('conventional_deadlift', 'glutes', 'primary', 1.0),
  ('conventional_deadlift', 'lower_back', 'primary', 1.0),
  ('conventional_deadlift', 'traps', 'secondary', 0.5),
  ('conventional_deadlift', 'upper_back', 'secondary', 0.5),
  ('conventional_deadlift', 'forearms', 'secondary', 0.5),
  ('seated_leg_curl', 'hamstrings', 'primary', 1.0),
  ('hip_thrust', 'glutes', 'primary', 1.0),
  ('hip_thrust', 'hamstrings', 'secondary', 0.5),

  -- Lunge
  ('bulgarian_split_squat', 'quads', 'primary', 1.0),
  ('bulgarian_split_squat', 'glutes', 'primary', 1.0),
  ('bulgarian_split_squat', 'adductors', 'secondary', 0.25),
  ('walking_lunge', 'quads', 'primary', 1.0),
  ('walking_lunge', 'glutes', 'primary', 1.0),

  -- Shoulders and arms
  ('lateral_raise', 'side_delts', 'primary', 1.0),
  ('cable_lateral_raise', 'side_delts', 'primary', 1.0),
  ('reverse_fly', 'rear_delts', 'primary', 1.0),
  ('reverse_fly', 'upper_back', 'secondary', 0.25),
  ('face_pull', 'rear_delts', 'primary', 1.0),
  ('face_pull', 'upper_back', 'secondary', 0.5),
  ('face_pull', 'traps', 'secondary', 0.25),
  ('barbell_curl', 'biceps', 'primary', 1.0),
  ('barbell_curl', 'forearms', 'secondary', 0.25),
  ('dumbbell_curl', 'biceps', 'primary', 1.0),
  ('dumbbell_curl', 'forearms', 'secondary', 0.25),
  ('incline_dumbbell_curl', 'biceps', 'primary', 1.0),
  ('cable_pushdown', 'triceps', 'primary', 1.0),
  ('overhead_cable_extension', 'triceps', 'primary', 1.0),

  -- Calves, core
  ('standing_calf_raise', 'calves', 'primary', 1.0),
  ('seated_calf_raise', 'calves', 'primary', 1.0),
  ('hanging_leg_raise', 'abs', 'primary', 1.0),
  ('hanging_leg_raise', 'forearms', 'stabilizer', 0.25),
  ('cable_crunch', 'abs', 'primary', 1.0),
  ('plank', 'abs', 'primary', 1.0),
  ('back_extension', 'lower_back', 'primary', 1.0),
  ('back_extension', 'glutes', 'secondary', 0.5),
  ('back_extension', 'hamstrings', 'secondary', 0.5);

-- ---------------------------------------------------------------------------
-- Alternatives — for swapping when equipment is busy or a movement hurts
-- ---------------------------------------------------------------------------

delete from public.exercise_alternatives;

insert into public.exercise_alternatives (exercise_id, alternative_id, similarity) values
  ('barbell_bench_press', 'dumbbell_bench_press', 0.95),
  ('barbell_bench_press', 'machine_chest_press', 0.85),
  ('barbell_bench_press', 'push_up', 0.6),
  ('dumbbell_bench_press', 'barbell_bench_press', 0.95),
  ('dumbbell_bench_press', 'machine_chest_press', 0.85),
  ('incline_dumbbell_press', 'dumbbell_bench_press', 0.8),
  ('machine_chest_press', 'dumbbell_bench_press', 0.85),
  ('overhead_press', 'dumbbell_shoulder_press', 0.95),
  ('dumbbell_shoulder_press', 'overhead_press', 0.95),
  ('barbell_row', 'chest_supported_row', 0.9),
  ('barbell_row', 'seated_cable_row', 0.85),
  ('barbell_row', 'dumbbell_row', 0.85),
  ('dumbbell_row', 'seated_cable_row', 0.9),
  ('seated_cable_row', 'chest_supported_row', 0.9),
  ('chest_supported_row', 'seated_cable_row', 0.9),
  ('pull_up', 'lat_pulldown', 0.9),
  ('lat_pulldown', 'pull_up', 0.9),
  ('back_squat', 'front_squat', 0.85),
  ('back_squat', 'hack_squat', 0.85),
  ('back_squat', 'leg_press', 0.75),
  ('back_squat', 'goblet_squat', 0.7),
  ('front_squat', 'back_squat', 0.85),
  ('leg_press', 'hack_squat', 0.9),
  ('hack_squat', 'leg_press', 0.9),
  ('romanian_deadlift', 'seated_leg_curl', 0.7),
  ('romanian_deadlift', 'hip_thrust', 0.7),
  ('conventional_deadlift', 'romanian_deadlift', 0.8),
  ('seated_leg_curl', 'romanian_deadlift', 0.7),
  ('hip_thrust', 'back_extension', 0.6),
  ('bulgarian_split_squat', 'walking_lunge', 0.9),
  ('walking_lunge', 'bulgarian_split_squat', 0.9),
  ('lateral_raise', 'cable_lateral_raise', 0.95),
  ('cable_lateral_raise', 'lateral_raise', 0.95),
  ('reverse_fly', 'face_pull', 0.9),
  ('face_pull', 'reverse_fly', 0.9),
  ('barbell_curl', 'dumbbell_curl', 0.95),
  ('dumbbell_curl', 'barbell_curl', 0.95),
  ('dumbbell_curl', 'incline_dumbbell_curl', 0.9),
  ('incline_dumbbell_curl', 'dumbbell_curl', 0.9),
  ('cable_pushdown', 'overhead_cable_extension', 0.85),
  ('overhead_cable_extension', 'cable_pushdown', 0.85),
  ('standing_calf_raise', 'seated_calf_raise', 0.85),
  ('seated_calf_raise', 'standing_calf_raise', 0.85),
  ('hanging_leg_raise', 'cable_crunch', 0.85),
  ('cable_crunch', 'hanging_leg_raise', 0.85);
