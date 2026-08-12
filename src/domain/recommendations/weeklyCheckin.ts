/**
 * Assembling one week's recommendations.
 *
 * The individual engines each answer one question. This module decides what the
 * user is actually shown, and the decisions it makes are about restraint:
 *
 *   - **A deload supersedes everything else on the training side.** Proposing a
 *     recovery week and a volume increase in the same breath is incoherent.
 *   - **At most two volume changes a week.** Change eight things at once and
 *     next week's data cannot tell you which one worked.
 *   - **Silence is a valid answer.** A week where nothing needs to change gets
 *     one honest "no change" rather than a page of filler.
 *
 * The `computed` snapshot records the objective inputs the engine saw, so a
 * recommendation stays explainable months later even after the underlying logs
 * have been edited (migration 0009).
 */

import { calorieAdjustment } from './calorieAdjustment';
import type { CalorieAdjustmentInput } from './calorieAdjustment';
import { assessRecovery } from './recovery';
import type { RecoveryAnswers, RecoveryAssessment } from './recovery';
import { deloadRecommendation, volumeAdjustment } from './trainingAdjustment';
import type { DeloadInput, VolumeAdjustmentInput } from './trainingAdjustment';
import type { Recommendation } from './types';
import type { IsoDate } from '@/types/domain';

/** More than this in one week and next week's data cannot attribute the result. */
export const MAX_VOLUME_RECOMMENDATIONS = 2;

export interface WeeklyCheckinInput {
  /** Monday of the week being reviewed. */
  weekStartDate: IsoDate;
  answers: RecoveryAnswers;
  /** Null when there is no nutrition data to work from at all. */
  calorie: CalorieAdjustmentInput | null;
  /** One entry per muscle worth reviewing. */
  muscles: readonly VolumeAdjustmentInput[];
  /** Null when there is no training history to judge fatigue from. */
  deload: DeloadInput | null;
}

export interface WeeklyCheckinResult {
  weekStartDate: IsoDate;
  recovery: RecoveryAssessment;
  /** Ordered as the user should read them. Never empty. */
  recommendations: Recommendation[];
  /** Snapshot for `weekly_checkins.computed`. JSON-serialisable. */
  computed: Record<string, unknown>;
}

export function reviewWeek(input: WeeklyCheckinInput): WeeklyCheckinResult {
  const recovery = assessRecovery(input.answers);

  const deload = input.deload ? deloadRecommendation(input.deload) : null;
  const isDeloading = deload?.type === 'deload';

  const calorie = input.calorie ? calorieAdjustment(input.calorie) : null;

  const volume = isDeloading
    ? []
    : input.muscles
        .map(volumeAdjustment)
        .filter((recommendation) => recommendation.type === 'volume_adjustment')
        // Confidence first, then the biggest change: if we are only allowed two,
        // they should be the two we are surest about.
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_VOLUME_RECOMMENDATIONS);

  const actionable: Recommendation[] = [];
  if (isDeloading && deload) actionable.push(deload);
  if (calorie && calorie.type !== 'no_change') actionable.push(calorie);
  actionable.push(...volume);

  const recommendations =
    actionable.length > 0 ? actionable : [noChangeSummary(calorie, deload, recovery)];

  return {
    weekStartDate: input.weekStartDate,
    recovery,
    recommendations,
    computed: buildSnapshot(input, recovery),
  };
}

/**
 * The "nothing to change" week, built from whichever engine had the most to say
 * about why. Falling back to a generic line here would waste the one moment the
 * user is paying attention to their own data.
 */
function noChangeSummary(
  calorie: Recommendation | null,
  deload: Recommendation | null,
  recovery: RecoveryAssessment,
): Recommendation {
  // An adherence message names something the user can act on this week, so it
  // outranks a "no change" that only says the numbers looked fine.
  if (calorie?.type === 'adherence') return calorie;
  // Otherwise prefer whichever engine cites real numbers. The calorie engine
  // always does; the deload one does when it has signals to report.
  if (calorie) return calorie;
  if (deload) return deload;

  return {
    type: 'no_change',
    currentValue: {},
    suggestedValue: {},
    reason:
      recovery.band === 'unknown'
        ? "There is not enough logged this week for us to say anything useful. Weigh in a few times, log your food, and fill in next week's check-in — the recommendations only work when there is something to read."
        : 'Nothing needs to change this week. Your targets and your training are where they should be, and the most useful thing you can do is run the same plan again.',
    confidence: recovery.score ?? 0,
    evidenceRuleIds: ['checkin.no_change'],
  };
}

function buildSnapshot(
  input: WeeklyCheckinInput,
  recovery: RecoveryAssessment,
): Record<string, unknown> {
  const estimate = input.calorie?.estimate;

  return {
    weekStartDate: input.weekStartDate,
    recovery: {
      score: recovery.score,
      band: recovery.band,
      answeredCount: recovery.answeredCount,
      concerns: recovery.concerns,
    },
    nutrition: estimate
      ? {
          goal: input.calorie?.goal ?? null,
          currentTargetKcal: input.calorie?.currentTargetKcal ?? null,
          estimatedTdeeKcal: estimate.estimatedTdeeKcal,
          meanIntakeKcal: estimate.meanIntakeKcal,
          weightChangeKgPerWeek: estimate.weightChangeKgPerWeek,
          confidence: estimate.confidence.overall,
          daysAnalysed: estimate.daysAnalysed,
          weighInCount: estimate.weighInCount,
          loggedDayCount: estimate.loggedDayCount,
        }
      : null,
    training: {
      muscles: input.muscles.map((muscle) => ({
        muscleId: muscle.muscleId,
        weeklySets: muscle.currentSets,
        frequency: muscle.frequency,
        isProgressing: muscle.isProgressing,
        adherenceRatio: muscle.adherenceRatio,
      })),
      weeksInBlock: input.deload?.weeksInBlock ?? null,
      stalledWeeks: input.deload?.stalledWeeks ?? null,
    },
  };
}
