/**
 * Deciding whether — and by how much — to move someone's calorie target.
 *
 * The default answer is "no change", and most of this module exists to defend
 * that default. Four things must all hold before calories move:
 *
 *   1. The TDEE estimate is confident enough to act on at all.
 *   2. Adherence is good enough that the observed rate reflects the plan
 *      rather than a week of not following it.
 *   3. The observed rate is genuinely outside the goal's band.
 *   4. Enough time has passed since the last change to see its effect.
 *
 * When adherence is the problem, the recommendation says so instead of moving
 * the target — changing a number the user was not hitting anyway is not a fix,
 * it is a way of hiding the real issue (SCIENTIFIC_RULES.md §2.2).
 */

import { classifyRate, GOAL_LABELS, GOAL_RATE_BANDS } from '../nutrition/goalAdjustment';
import { enforceCalorieFloor } from '../nutrition/safety';
import type { SafetyFlag } from '../nutrition/safety';
import { maxAdjustmentKcal } from '../nutrition/tdeeEstimator';
import type { TdeeEstimate } from '../nutrition/tdeeEstimator';
import type { Recommendation } from './types';
import { clamp, roundTo } from '@/utils/number';
import type { GoalType, Sex } from '@/types/domain';

/** Days that must pass before calories are moved again. */
export const MIN_DAYS_BETWEEN_ADJUSTMENTS = 14;

/**
 * Logged days per week below which the observed rate says more about logging
 * than about physiology.
 */
export const MIN_LOGGING_DAYS_PER_WEEK = 4;

export interface CalorieAdjustmentInput {
  goal: GoalType;
  currentTargetKcal: number;
  estimate: TdeeEstimate;
  weightKg: number;
  sex: Sex;
  bmrKcal: number;
  /** Null when no adjustment has ever been made. */
  daysSinceLastAdjustment: number | null;
  safetyFlags: readonly SafetyFlag[];
}

export function calorieAdjustment(input: CalorieAdjustmentInput): Recommendation {
  const { estimate, goal, currentTargetKcal } = input;
  const confidence = estimate.confidence.overall;
  const currentValue = { energyKcal: currentTargetKcal, goal };

  // --- Gate 1: is the estimate worth acting on? --------------------------

  if (!estimate.isUsable || estimate.weightChangeKgPerWeek === null) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `We are keeping your target at ${currentTargetKcal.toLocaleString('en-US')} kcal. ${estimate.explanation}`,
      confidence,
      evidenceRuleIds: ['tdee.min_window_days'],
    };
  }

  // --- Gate 2: is adherence good enough for the rate to mean anything? ---

  const weeks = Math.max(estimate.daysAnalysed / 7, 1);
  const loggedPerWeek = estimate.loggedDayCount / weeks;

  if (loggedPerWeek < MIN_LOGGING_DAYS_PER_WEEK) {
    return {
      type: 'adherence',
      currentValue,
      suggestedValue: {},
      reason: `You logged food on about ${loggedPerWeek.toFixed(1)} days a week over the last ${estimate.daysAnalysed} days. Before we change your calories, it is worth getting a couple of weeks of consistent logging — otherwise we would be adjusting a target you were not following, which fixes nothing.`,
      confidence,
      evidenceRuleIds: ['tdee.min_window_days'],
    };
  }

  // --- Gate 3: is the rate actually off target? --------------------------

  const observedRate = estimate.weightChangeKgPerWeek;
  const status = classifyRate(goal, observedRate, input.weightKg);
  const band = GOAL_RATE_BANDS[goal];

  if (status === 'on_target') {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `Your weight is moving ${formatRate(observedRate)} per week, which is where ${GOAL_LABELS[goal].toLowerCase()} should be. Keep your target at ${currentTargetKcal.toLocaleString('en-US')} kcal — no change needed.`,
      confidence,
      evidenceRuleIds: [`goal.rate_band.${goal}`],
    };
  }

  // --- Gate 4: has the last change had time to show its effect? ----------

  if (
    input.daysSinceLastAdjustment !== null &&
    input.daysSinceLastAdjustment < MIN_DAYS_BETWEEN_ADJUSTMENTS
  ) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `Your weight is moving ${formatRate(observedRate)} per week, which is outside the band for ${GOAL_LABELS[goal].toLowerCase()} — but you changed your target ${input.daysSinceLastAdjustment} days ago. We wait ${MIN_DAYS_BETWEEN_ADJUSTMENTS} days between changes so each one has time to show up in the trend.`,
      confidence,
      evidenceRuleIds: ['calorie.adjustment_interval'],
    };
  }

  // --- The adjustment itself ---------------------------------------------

  const cap = maxAdjustmentKcal(confidence);
  if (cap === 0) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `Your weight is moving ${formatRate(observedRate)} per week, which is outside your target band — but the data is not yet consistent enough for us to act on. More regular weigh-ins and food logging will let us adjust with confidence.`,
      confidence,
      evidenceRuleIds: ['tdee.confidence_gate'],
    };
  }

  /*
   * Size the change from the actual gap, then cap it by confidence. Working
   * from the gap rather than a fixed step means a small miss gets a small
   * nudge; the cap means an uncertain estimate can never produce a big one.
   */
  const targetRatePercent = (band.minPercentPerWeek + band.maxPercentPerWeek) / 2;
  const targetRateKg = (targetRatePercent / 100) * input.weightKg;
  const rateGapKg = targetRateKg - observedRate;

  // Energy needed per day to close the weekly gap.
  const rawDelta = (rateGapKg / 7) * 7700;
  const delta = roundTo(clamp(rawDelta, -cap, cap), 10);

  if (delta === 0) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason: `Your rate is slightly outside the band, but the change it implies rounds to nothing. Keeping your target at ${currentTargetKcal.toLocaleString('en-US')} kcal.`,
      confidence,
      evidenceRuleIds: [`goal.rate_band.${goal}`],
    };
  }

  const requested = currentTargetKcal + delta;
  const floored = enforceCalorieFloor(requested, input.sex, input.bmrKcal);
  const suggestedKcal = roundTo(floored.energyKcal, 10);

  const blocksDeficit = input.safetyFlags.some((flag) => flag.severity === 'block_deficit');
  if (blocksDeficit && suggestedKcal < currentTargetKcal) {
    return {
      type: 'no_change',
      currentValue,
      suggestedValue: {},
      reason:
        'Based on your answers we are not recommending a calorie reduction. If losing weight is your goal, please talk it through with a doctor or registered dietitian first.',
      confidence,
      evidenceRuleIds: ['safety.block_deficit'],
    };
  }

  return {
    type: 'calorie_adjustment',
    currentValue,
    suggestedValue: { energyKcal: suggestedKcal, deltaKcal: suggestedKcal - currentTargetKcal },
    reason: buildAdjustmentReason({
      goal,
      observedRate,
      targetRateKg,
      currentTargetKcal,
      suggestedKcal,
      estimate,
      wasClamped: floored.wasClamped,
    }),
    confidence,
    evidenceRuleIds: [`goal.rate_band.${goal}`, 'tdee.energy_density_kg', 'tdee.confidence_gate'],
  };
}

function buildAdjustmentReason(input: {
  goal: GoalType;
  observedRate: number;
  targetRateKg: number;
  currentTargetKcal: number;
  suggestedKcal: number;
  estimate: TdeeEstimate;
  wasClamped: boolean;
}): string {
  const delta = input.suggestedKcal - input.currentTargetKcal;
  const direction = delta > 0 ? 'increasing' : 'reducing';

  const parts = [
    `We are ${direction} your target by ${Math.abs(delta)} kcal, from ${input.currentTargetKcal.toLocaleString('en-US')} to ${input.suggestedKcal.toLocaleString('en-US')}.`,
    `Over the last ${input.estimate.daysAnalysed} days your weight moved ${formatRate(input.observedRate)} per week, where ${GOAL_LABELS[input.goal].toLowerCase()} is aiming for about ${formatRate(input.targetRateKg)}.`,
    `You logged ${input.estimate.loggedDayCount} days of food and weighed in ${input.estimate.weighInCount} times in that period, which is enough for us to trust the picture.`,
  ];

  if (input.wasClamped) {
    parts.push(
      'The change was limited by the minimum intake we are willing to recommend, so it is smaller than the maths alone would suggest.',
    );
  }

  return parts.join(' ');
}

function formatRate(kgPerWeek: number): string {
  const rounded = Math.round(Math.abs(kgPerWeek) * 100) / 100;
  if (rounded < 0.01) return 'less than 0.01 kg';
  return `${kgPerWeek > 0 ? '+' : '−'}${rounded} kg`;
}
