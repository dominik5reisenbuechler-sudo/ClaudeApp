/**
 * Achievements.
 *
 * Every achievement is a **threshold on a metric the app already computes**.
 * That constraint is deliberate: an achievement whose progress cannot be shown
 * is a lottery ticket, and one that unlocks on something we do not otherwise
 * measure is a second, unaudited source of truth about the user's training.
 *
 * What is deliberately *not* here: achievements for weight lost, for a body-fat
 * figure, or for any target-weight milestone. Rewarding a number on a scale
 * with a badge is exactly the mechanic that makes tracking apps harmful for the
 * people most at risk from them (CLAUDE.md §55). Body-category achievements
 * reward *measuring* and *consistency*, never a direction of travel.
 *
 * Unlocks are detected, not stored as intent: `detectUnlocks` compares current
 * progress against what is already unlocked and returns the difference. Running
 * it twice returns nothing the second time.
 */

import type { AchievementCategory, IsoDate } from '@/types/domain';

/** The metrics an achievement may threshold on. */
export type AchievementMetric =
  | 'workouts_completed'
  | 'training_streak'
  | 'nutrition_streak'
  | 'protein_streak'
  | 'steps_streak'
  | 'meal_planning_streak'
  | 'days_logged'
  | 'weigh_ins'
  | 'personal_records'
  | 'checkins_completed'
  | 'recipes_cooked'
  | 'total_xp';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  metric: AchievementMetric;
  threshold: number;
  xpReward: number;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  // --- Training ----------------------------------------------------------
  { id: 'first_session', name: 'First Session', description: 'Complete your first workout.', icon: '🏁', category: 'training', metric: 'workouts_completed', threshold: 1, xpReward: 100 },
  { id: 'ten_sessions', name: 'Getting Going', description: 'Complete 10 workouts.', icon: '💪', category: 'training', metric: 'workouts_completed', threshold: 10, xpReward: 200 },
  { id: 'fifty_sessions', name: 'Committed', description: 'Complete 50 workouts.', icon: '🔩', category: 'training', metric: 'workouts_completed', threshold: 50, xpReward: 500 },
  { id: 'hundred_sessions', name: 'Two Hundred Hours', description: 'Complete 100 workouts.', icon: '🏛️', category: 'training', metric: 'workouts_completed', threshold: 100, xpReward: 1000 },
  { id: 'first_pr', name: 'New Best', description: 'Set your first personal record.', icon: '📈', category: 'training', metric: 'personal_records', threshold: 1, xpReward: 100 },
  { id: 'ten_prs', name: 'Stronger', description: 'Set 10 personal records.', icon: '🥇', category: 'training', metric: 'personal_records', threshold: 10, xpReward: 300 },

  // --- Nutrition ---------------------------------------------------------
  { id: 'first_log', name: 'First Log', description: 'Log a day of food.', icon: '🍽️', category: 'nutrition', metric: 'days_logged', threshold: 1, xpReward: 50 },
  { id: 'thirty_days_logged', name: 'A Month of Data', description: 'Log 30 days of food.', icon: '📔', category: 'nutrition', metric: 'days_logged', threshold: 30, xpReward: 300 },
  { id: 'hundred_days_logged', name: 'The Long Game', description: 'Log 100 days of food.', icon: '📚', category: 'nutrition', metric: 'days_logged', threshold: 100, xpReward: 750 },
  { id: 'protein_week', name: 'Protein Week', description: 'Hit your protein target 7 days running.', icon: '🥚', category: 'nutrition', metric: 'protein_streak', threshold: 7, xpReward: 200 },
  { id: 'protein_month', name: 'Protein Month', description: 'Hit your protein target 30 days running.', icon: '🍗', category: 'nutrition', metric: 'protein_streak', threshold: 30, xpReward: 600 },
  { id: 'cooked_ten', name: 'Home Cook', description: 'Cook 10 recipes from your plan.', icon: '🥘', category: 'nutrition', metric: 'recipes_cooked', threshold: 10, xpReward: 200 },

  // --- Consistency -------------------------------------------------------
  { id: 'training_week', name: 'A Week In', description: 'Keep a 7-day training streak. Rest days count as kept.', icon: '🔥', category: 'consistency', metric: 'training_streak', threshold: 7, xpReward: 150 },
  { id: 'training_month', name: 'A Month In', description: 'Keep a 30-day training streak.', icon: '🌋', category: 'consistency', metric: 'training_streak', threshold: 30, xpReward: 500 },
  { id: 'training_quarter', name: 'Ninety Days', description: 'Keep a 90-day training streak.', icon: '⛰️', category: 'consistency', metric: 'training_streak', threshold: 90, xpReward: 1200 },
  { id: 'nutrition_week', name: 'Dialled In', description: 'Hit your calorie target 7 days running.', icon: '🎯', category: 'consistency', metric: 'nutrition_streak', threshold: 7, xpReward: 150 },
  { id: 'steps_week', name: 'On Your Feet', description: 'Hit your step goal 7 days running.', icon: '👟', category: 'consistency', metric: 'steps_streak', threshold: 7, xpReward: 120 },
  { id: 'planner_month', name: 'Planned Ahead', description: 'Build a meal plan four weeks running.', icon: '🗓️', category: 'consistency', metric: 'meal_planning_streak', threshold: 4, xpReward: 250 },

  // --- Body: measuring, never a direction of travel ----------------------
  { id: 'first_weigh_in', name: 'Baseline', description: 'Log your first weigh-in.', icon: '⚖️', category: 'body', metric: 'weigh_ins', threshold: 1, xpReward: 50 },
  { id: 'thirty_weigh_ins', name: 'Signal Over Noise', description: 'Log 30 weigh-ins — enough for the trend to mean something.', icon: '📉', category: 'body', metric: 'weigh_ins', threshold: 30, xpReward: 250 },
  { id: 'hundred_weigh_ins', name: 'Trend Reader', description: 'Log 100 weigh-ins.', icon: '🔭', category: 'body', metric: 'weigh_ins', threshold: 100, xpReward: 600 },

  // --- Milestones --------------------------------------------------------
  { id: 'first_checkin', name: 'Closing the Loop', description: 'Complete your first weekly check-in.', icon: '🔄', category: 'milestone', metric: 'checkins_completed', threshold: 1, xpReward: 150 },
  { id: 'twelve_checkins', name: 'A Season of Coaching', description: 'Complete 12 weekly check-ins.', icon: '🧭', category: 'milestone', metric: 'checkins_completed', threshold: 12, xpReward: 600 },
  { id: 'level_five', name: 'Level 5', description: 'Reach 2,500 XP.', icon: '⭐', category: 'milestone', metric: 'total_xp', threshold: 2500, xpReward: 0 },
  { id: 'level_ten', name: 'Level 10', description: 'Reach 11,250 XP.', icon: '🌟', category: 'milestone', metric: 'total_xp', threshold: 11250, xpReward: 0 },
];

export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, AchievementDefinition> = new Map(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]),
);

/** Current value of every metric achievements can threshold on. */
export type AchievementProgress = Record<AchievementMetric, number>;

export const EMPTY_PROGRESS: AchievementProgress = {
  workouts_completed: 0,
  training_streak: 0,
  nutrition_streak: 0,
  protein_streak: 0,
  steps_streak: 0,
  meal_planning_streak: 0,
  days_logged: 0,
  weigh_ins: 0,
  personal_records: 0,
  checkins_completed: 0,
  recipes_cooked: 0,
  total_xp: 0,
};

export interface AchievementStatus {
  definition: AchievementDefinition;
  /** Current value of the metric, capped at the threshold for display. */
  value: number;
  /** 0–1. */
  fraction: number;
  unlockedOn: IsoDate | null;
}

/**
 * Every achievement with its progress, unlocked ones first and then the ones
 * closest to unlocking.
 *
 * Locked achievements are shown rather than hidden. A locked row with a
 * progress bar tells the user what the app values; a hidden one tells them
 * nothing until it is too late to aim for it.
 */
export function achievementStatuses(
  progress: AchievementProgress,
  unlocked: ReadonlyMap<string, IsoDate>,
): AchievementStatus[] {
  return ACHIEVEMENTS.map((definition) => {
    const raw = progress[definition.metric] ?? 0;
    const unlockedOn = unlocked.get(definition.id) ?? null;

    return {
      definition,
      value: Math.min(raw, definition.threshold),
      fraction:
        definition.threshold <= 0 ? 1 : Math.min(1, Math.max(0, raw / definition.threshold)),
      unlockedOn,
    };
  }).sort((a, b) => {
    if (a.unlockedOn && !b.unlockedOn) return -1;
    if (!a.unlockedOn && b.unlockedOn) return 1;
    if (a.unlockedOn && b.unlockedOn) return a.unlockedOn < b.unlockedOn ? 1 : -1;
    return b.fraction - a.fraction;
  });
}

export interface DetectedUnlock {
  achievementId: string;
  unlockedOn: IsoDate;
  xpReward: number;
}

/**
 * Achievements that have become true and are not yet recorded.
 *
 * Idempotent by construction: anything already in `unlocked` is skipped, so
 * running this on every app open cannot double-award.
 */
export function detectUnlocks(
  progress: AchievementProgress,
  unlocked: ReadonlySet<string>,
  today: IsoDate,
): DetectedUnlock[] {
  return ACHIEVEMENTS.filter(
    (achievement) =>
      !unlocked.has(achievement.id) &&
      (progress[achievement.metric] ?? 0) >= achievement.threshold,
  ).map((achievement) => ({
    achievementId: achievement.id,
    unlockedOn: today,
    xpReward: achievement.xpReward,
  }));
}

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  training: 'Training',
  nutrition: 'Nutrition',
  consistency: 'Consistency',
  body: 'Measuring',
  milestone: 'Milestones',
};
