/**
 * Step summarisation.
 *
 * Steps are treated as an activity signal the user controls, not as a calorie
 * figure to be spent. Nothing here converts steps into an energy allowance —
 * that path runs through the adaptive TDEE estimator instead, which calibrates
 * against real intake and weight change rather than trusting a pedometer
 * (CLAUDE.md §40).
 */

import { addDays, daysBetween, isIsoDate } from '@/utils/date';
import { mean } from '@/utils/number';
import type { IsoDate } from '@/types/domain';

export interface StepPoint {
  date: IsoDate;
  steps: number;
}

export const STEP_WINDOW_DAYS = 7;

export interface StepsSummary {
  /** Steps logged for `today`, or `null` if nothing is logged yet. */
  todaySteps: number | null;
  /** Mean over days that have an entry inside the window, or `null`. */
  averageDailySteps: number | null;
  goal: number;
  /** Steps still needed today to reach the goal. Zero once met. */
  remainingToday: number;
  /** Whether today's goal is already met. */
  goalMet: boolean;
  /** Days inside the window that met the goal. */
  daysGoalMet: number;
  /** Days inside the window with any entry at all. */
  daysLogged: number;
}

function normalize(points: readonly StepPoint[]): StepPoint[] {
  const byDate = new Map<IsoDate, number>();
  for (const point of points) {
    if (!isIsoDate(point.date)) continue;
    if (!Number.isFinite(point.steps) || point.steps < 0) continue;
    byDate.set(point.date, Math.round(point.steps));
  }
  return [...byDate.entries()]
    .map(([date, steps]) => ({ date, steps }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Summarise steps over the window ending on `today`.
 *
 * The average covers only days that were actually logged. Treating an unlogged
 * day as zero would drag the average down and make a user who simply forgot to
 * log look sedentary — which would then feed a lower expenditure estimate.
 */
export function summarizeSteps(
  points: readonly StepPoint[],
  goal: number,
  today: IsoDate,
  windowDays: number = STEP_WINDOW_DAYS,
): StepsSummary {
  if (windowDays < 1) throw new Error('summarizeSteps: windowDays must be at least 1');

  const sorted = normalize(points);
  const windowStart = addDays(today, -(windowDays - 1));
  const inWindow = sorted.filter((p) => p.date >= windowStart && p.date <= today);

  const todayEntry = sorted.find((p) => p.date === today);
  const todaySteps = todayEntry ? todayEntry.steps : null;

  const average = mean(inWindow.map((p) => p.steps));

  return {
    todaySteps,
    averageDailySteps: average === null ? null : Math.round(average),
    goal,
    remainingToday: Math.max(0, goal - (todaySteps ?? 0)),
    goalMet: (todaySteps ?? 0) >= goal,
    daysGoalMet: inWindow.filter((p) => p.steps >= goal).length,
    daysLogged: inWindow.length,
  };
}

/**
 * Average steps over the whole history, for the energy model's
 * `averageDailySteps` input. Falls back to the onboarding estimate when there
 * is not yet enough logged data to beat it.
 */
export function estimatedDailySteps(
  points: readonly StepPoint[],
  onboardingEstimate: number,
  today: IsoDate,
  minimumDays = 5,
): { steps: number; source: 'logged' | 'onboarding' } {
  const sorted = normalize(points);
  const recent = sorted.filter((p) => daysBetween(p.date, today) <= 28 && p.date <= today);

  if (recent.length < minimumDays) return { steps: onboardingEstimate, source: 'onboarding' };

  const average = mean(recent.map((p) => p.steps));
  if (average === null) return { steps: onboardingEstimate, source: 'onboarding' };

  return { steps: Math.round(average), source: 'logged' };
}
