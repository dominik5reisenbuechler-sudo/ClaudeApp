-- 0004 — Achievements.
--
-- Generated from src/domain/gamification/achievements.ts, which is the source
-- of truth: the app evaluates thresholds against the TypeScript catalogue and
-- only stores the id, so a row here that the catalogue does not know about
-- would never unlock, and one the catalogue knows about that is missing here
-- would break the foreign key on `user_achievements`.
-- `achievements.seed.test.ts` asserts the two agree.
--
-- Note what is absent: nothing unlocks on weight lost, on a body-fat figure, or
-- on reaching a goal weight. Rewarding a direction of travel on the scale with
-- a badge is the mechanic that makes tracking apps harmful for the people most
-- at risk from them (CLAUDE.md §55). The `body` category rewards *measuring*.

insert into public.achievements
  (id, name, description, icon, category, metric, threshold, xp_reward, sort_order)
values
  ('first_session', 'First Session', 'Complete your first workout.', '🏁', 'training', 'workouts_completed', 1, 100, 0),
  ('ten_sessions', 'Getting Going', 'Complete 10 workouts.', '💪', 'training', 'workouts_completed', 10, 200, 1),
  ('fifty_sessions', 'Committed', 'Complete 50 workouts.', '🔩', 'training', 'workouts_completed', 50, 500, 2),
  ('hundred_sessions', 'Two Hundred Hours', 'Complete 100 workouts.', '🏛️', 'training', 'workouts_completed', 100, 1000, 3),
  ('first_pr', 'New Best', 'Set your first personal record.', '📈', 'training', 'personal_records', 1, 100, 4),
  ('ten_prs', 'Stronger', 'Set 10 personal records.', '🥇', 'training', 'personal_records', 10, 300, 5),
  ('first_log', 'First Log', 'Log a day of food.', '🍽️', 'nutrition', 'days_logged', 1, 50, 6),
  ('thirty_days_logged', 'A Month of Data', 'Log 30 days of food.', '📔', 'nutrition', 'days_logged', 30, 300, 7),
  ('hundred_days_logged', 'The Long Game', 'Log 100 days of food.', '📚', 'nutrition', 'days_logged', 100, 750, 8),
  ('protein_week', 'Protein Week', 'Hit your protein target 7 days running.', '🥚', 'nutrition', 'protein_streak', 7, 200, 9),
  ('protein_month', 'Protein Month', 'Hit your protein target 30 days running.', '🍗', 'nutrition', 'protein_streak', 30, 600, 10),
  ('cooked_ten', 'Home Cook', 'Cook 10 recipes from your plan.', '🥘', 'nutrition', 'recipes_cooked', 10, 200, 11),
  ('training_week', 'A Week In', 'Keep a 7-day training streak. Rest days count as kept.', '🔥', 'consistency', 'training_streak', 7, 150, 12),
  ('training_month', 'A Month In', 'Keep a 30-day training streak.', '🌋', 'consistency', 'training_streak', 30, 500, 13),
  ('training_quarter', 'Ninety Days', 'Keep a 90-day training streak.', '⛰️', 'consistency', 'training_streak', 90, 1200, 14),
  ('nutrition_week', 'Dialled In', 'Hit your calorie target 7 days running.', '🎯', 'consistency', 'nutrition_streak', 7, 150, 15),
  ('steps_week', 'On Your Feet', 'Hit your step goal 7 days running.', '👟', 'consistency', 'steps_streak', 7, 120, 16),
  ('planner_month', 'Planned Ahead', 'Build a meal plan four weeks running.', '🗓️', 'consistency', 'meal_planning_streak', 4, 250, 17),
  ('first_weigh_in', 'Baseline', 'Log your first weigh-in.', '⚖️', 'body', 'weigh_ins', 1, 50, 18),
  ('thirty_weigh_ins', 'Signal Over Noise', 'Log 30 weigh-ins — enough for the trend to mean something.', '📉', 'body', 'weigh_ins', 30, 250, 19),
  ('hundred_weigh_ins', 'Trend Reader', 'Log 100 weigh-ins.', '🔭', 'body', 'weigh_ins', 100, 600, 20),
  ('first_checkin', 'Closing the Loop', 'Complete your first weekly check-in.', '🔄', 'milestone', 'checkins_completed', 1, 150, 21),
  ('twelve_checkins', 'A Season of Coaching', 'Complete 12 weekly check-ins.', '🧭', 'milestone', 'checkins_completed', 12, 600, 22),
  ('level_five', 'Level 5', 'Reach 2,500 XP.', '⭐', 'milestone', 'total_xp', 2500, 0, 23),
  ('level_ten', 'Level 10', 'Reach 11,250 XP.', '🌟', 'milestone', 'total_xp', 11250, 0, 24)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  category    = excluded.category,
  metric      = excluded.metric,
  threshold   = excluded.threshold,
  xp_reward   = excluded.xp_reward,
  sort_order  = excluded.sort_order;
