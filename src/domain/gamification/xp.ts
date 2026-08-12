/**
 * The XP ledger.
 *
 * XP is an append-only list of events and the total is a sum. There is no
 * stored counter, because a counter drifts: one failed write, one retried
 * mutation, one deleted log, and the number on the dashboard no longer
 * corresponds to anything. A sum over the events is always right, and it is
 * always explainable — every point can be traced to the day it came from.
 *
 * Awards are **derived, not decided**: `xpForDay` looks at what a day's logs
 * actually contain and returns the events that ought to exist for it. Running
 * it twice produces the same list, which is what makes the write idempotent
 * (the database enforces uniqueness on `(user_id, kind, earned_on)`).
 *
 * One tension worth naming: paying XP for hitting a calorie target rewards the
 * *number*, and the number is self-reported. Someone who under-logs looks more
 * successful than someone who logs honestly and goes over. We reduce that a
 * little by requiring the day to look completely logged before it can qualify
 * at all, but it cannot be designed away — which is why nothing in the adaptive
 * engine reads XP. Points are encouragement; they are never evidence.
 */

import type { IsoDate, XpKind } from '@/types/domain';

export const XP_AWARDS: Record<XpKind, number> = {
  workout_completed: 100,
  calorie_target: 50,
  protein_target: 50,
  step_goal: 30,
  weight_logged: 10,
  meal_plan: 30,
  checkin_completed: 60,
  // Achievement rewards vary; the value is carried on the event itself.
  achievement: 0,
};

export const XP_LABELS: Record<XpKind, string> = {
  workout_completed: 'Workout completed',
  calorie_target: 'Calories on target',
  protein_target: 'Protein target hit',
  step_goal: 'Step goal reached',
  weight_logged: 'Weighed in',
  meal_plan: 'Meal plan for the week',
  checkin_completed: 'Weekly check-in',
  achievement: 'Achievement unlocked',
};

export interface XpEvent {
  kind: XpKind;
  xp: number;
  earnedOn: IsoDate;
  /** What it was for, in the user's terms. */
  context: Record<string, unknown>;
}

export function totalXp(events: readonly XpEvent[]): number {
  return events.reduce((total, event) => total + event.xp, 0);
}

export function xpByKind(events: readonly XpEvent[]): Partial<Record<XpKind, number>> {
  const totals: Partial<Record<XpKind, number>> = {};
  for (const event of events) {
    totals[event.kind] = (totals[event.kind] ?? 0) + event.xp;
  }
  return totals;
}

/**
 * How close to target counts as "on target" for calories.
 *
 * A band rather than a number: nobody lands on 2,847 kcal exactly, and demanding
 * it would teach people to log to the target instead of logging what they ate.
 */
export const CALORIE_BAND_PERCENT = 5;

/**
 * Protein is a floor, not a band. Going over is not a failure — it is the
 * direction the evidence points (SCIENTIFIC_RULES.md §3.1), so more protein
 * still earns the award.
 */
export const PROTEIN_TARGET_FRACTION = 0.95;

/**
 * Below this share of the calorie target, the day looks like a partial log
 * rather than a day of eating, and nothing about it can qualify.
 */
const PLAUSIBLE_LOG_FRACTION = 0.5;

export interface DayForXp {
  date: IsoDate;
  /** Null when nothing was logged that day. */
  energyKcal: number | null;
  proteinG: number | null;
  steps: number | null;
  weightLogged: boolean;
  workoutsCompleted: number;
  targets: {
    energyKcal: number;
    proteinG: number;
    stepGoal: number;
  };
}

/**
 * The XP events a single day has earned.
 *
 * At most one of each kind per day, however many workouts were logged: two
 * sessions in a day is not twice the training, and paying for it would reward
 * splitting one session in half.
 */
export function xpForDay(day: DayForXp): XpEvent[] {
  const events: XpEvent[] = [];

  if (day.workoutsCompleted > 0) {
    events.push({
      kind: 'workout_completed',
      xp: XP_AWARDS.workout_completed,
      earnedOn: day.date,
      context: { sessions: day.workoutsCompleted },
    });
  }

  if (day.weightLogged) {
    events.push({
      kind: 'weight_logged',
      xp: XP_AWARDS.weight_logged,
      earnedOn: day.date,
      context: {},
    });
  }

  if (day.steps !== null && day.steps >= day.targets.stepGoal) {
    events.push({
      kind: 'step_goal',
      xp: XP_AWARDS.step_goal,
      earnedOn: day.date,
      context: { steps: day.steps, goal: day.targets.stepGoal },
    });
  }

  // Nutrition awards need a day that looks like a real, complete log.
  const looksLogged =
    day.energyKcal !== null &&
    day.energyKcal >= day.targets.energyKcal * PLAUSIBLE_LOG_FRACTION;

  if (looksLogged && day.energyKcal !== null) {
    const tolerance = (day.targets.energyKcal * CALORIE_BAND_PERCENT) / 100;
    if (Math.abs(day.energyKcal - day.targets.energyKcal) <= tolerance) {
      events.push({
        kind: 'calorie_target',
        xp: XP_AWARDS.calorie_target,
        earnedOn: day.date,
        context: { energyKcal: day.energyKcal, target: day.targets.energyKcal },
      });
    }

    if (day.proteinG !== null && day.proteinG >= day.targets.proteinG * PROTEIN_TARGET_FRACTION) {
      events.push({
        kind: 'protein_target',
        xp: XP_AWARDS.protein_target,
        earnedOn: day.date,
        context: { proteinG: day.proteinG, target: day.targets.proteinG },
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/**
 * XP needed to reach each level, growing gently.
 *
 * The curve matters more than it looks. Linear levels stop meaning anything
 * once someone is at level 40; a steep curve makes the number stop moving
 * exactly when a new user most needs to see it move. This one is quadratic with
 * a shallow coefficient: early levels arrive in days, later ones in weeks, and
 * nothing ever becomes unreachable.
 *
 *     total XP for level n = 250 × (n − 1) × n / 2
 *
 * So level 2 costs 250, level 5 costs 2,500, level 20 costs 47,500 — about a
 * year of consistent training and logging.
 */
export const XP_LEVEL_STEP = 250;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (XP_LEVEL_STEP * (level - 1) * level) / 2;
}

export interface LevelProgress {
  level: number;
  /** XP earned within the current level. */
  xpIntoLevel: number;
  /** XP the current level spans. */
  xpForNextLevel: number;
  /** 0–1 through the current level. */
  fraction: number;
}

export function levelProgress(total: number): LevelProgress {
  const safeTotal = Math.max(0, total);

  let level = 1;
  while (xpForLevel(level + 1) <= safeTotal) level += 1;

  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = next - base;

  return {
    level,
    xpIntoLevel: safeTotal - base,
    xpForNextLevel: span,
    fraction: span === 0 ? 0 : (safeTotal - base) / span,
  };
}
