/**
 * Dashboard-level view of bodyweight.
 *
 * Turns raw weigh-ins into the four things a user actually wants on the home
 * screen: today's number, the smoothed number, which way it is going, and
 * whether that matches what they are trying to do.
 *
 * The rate assessment is deliberately conservative. It reports "not enough
 * data yet" until there is a real trend to report, because telling someone
 * their bulk is failing after four days of weigh-ins would be both wrong and
 * demoralising.
 */

import { classifyRate, GOAL_LABELS } from '../nutrition/goalAdjustment';
import type { RateStatus } from '../nutrition/goalAdjustment';
import { averageAsOf, normalizeWeightPoints, weightTrend } from '../nutrition/weightTrend';
import type { WeightTrend } from '../nutrition/weightTrend';
import type { GoalType, IsoDate, WeightPoint } from '@/types/domain';

export type RateAssessment = RateStatus | 'unknown';

export interface WeightSummary {
  /** Most recent weigh-in, whenever it was. */
  latest: WeightPoint | null;
  /** True when there is an entry for `today`. */
  loggedToday: boolean;
  /** 7-day trailing average, or `null` when too sparse to smooth. */
  averageKg: number | null;
  /** Rate of change, or `null` when the history is too short. */
  trend: WeightTrend | null;
  assessment: RateAssessment;
  /** Plain-language reading of the assessment, built from the real numbers. */
  message: string;
}

export function summarizeWeight(
  points: readonly WeightPoint[],
  goal: GoalType,
  today: IsoDate,
): WeightSummary {
  const sorted = normalizeWeightPoints(points);
  const latest = sorted[sorted.length - 1] ?? null;
  const loggedToday = latest?.date === today;

  const averageKg = averageAsOf(sorted, today);
  const trend = weightTrend(sorted);

  if (!trend || averageKg === null) {
    return {
      latest,
      loggedToday,
      averageKg,
      trend,
      assessment: 'unknown',
      message:
        'Keep logging your weight. Once there are a couple of weeks of data we can tell you whether your current calories are doing what you want.',
    };
  }

  const assessment = classifyRate(goal, trend.kgPerWeek, trend.latestAverageKg);

  return {
    latest,
    loggedToday,
    averageKg,
    trend,
    assessment,
    message: buildMessage(goal, assessment, trend),
  };
}

/**
 * `above_band` means the weight is moving *up* more — or *down* less — than the
 * goal intends; `below_band` is the reverse. What that means for the user
 * depends entirely on the goal: above the band is too much fat gain on a bulk,
 * but a stalled cut. So the copy is written per goal, not per direction.
 */
function buildMessage(goal: GoalType, assessment: RateAssessment, trend: WeightTrend): string {
  const rate = formatRate(trend.kgPerWeek);
  const basis = `Your 7-day average has moved ${rate} per week over the last ${trend.spanDays} days`;

  if (assessment === 'on_target') {
    return `${basis} — that is on track for ${GOAL_LABELS[goal].toLowerCase()}. No change needed.`;
  }

  const movingUpMoreThanIntended = assessment === 'above_band';

  switch (goal) {
    case 'lean_bulk':
      return movingUpMoreThanIntended
        ? `${basis}, which is faster than a lean bulk needs. Gaining faster mostly adds fat, so we may suggest trimming calories slightly.`
        : `${basis}, which is slower than your bulk is aiming for. If this holds for another week we may suggest a small calorie increase.`;

    case 'cut':
      return movingUpMoreThanIntended
        ? `${basis}, which is slower than your cut is aiming for. Adherence is usually the first thing to check, before cutting calories further.`
        : `${basis}, which is faster than your cut is aiming for. Losing this quickly costs lean mass and training performance, so we may suggest eating a little more.`;

    case 'recomposition':
    case 'maintenance':
      return movingUpMoreThanIntended
        ? `${basis}, which is more than you were aiming to gain. Worth watching for another week before changing anything.`
        : `${basis}, which is more of a drop than you were aiming for. Worth watching for another week before changing anything.`;
  }
}

function formatRate(kgPerWeek: number): string {
  const rounded = Math.round(Math.abs(kgPerWeek) * 100) / 100;
  if (rounded < 0.05) return 'less than 0.05 kg';
  return `${kgPerWeek > 0 ? '+' : '−'}${rounded} kg`;
}
