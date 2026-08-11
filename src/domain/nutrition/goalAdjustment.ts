/**
 * Translating a goal into an energy offset and a target rate of weight change.
 *
 * Rates are expressed as a percentage of bodyweight per week, not absolute
 * kilograms: 0.5 kg/week is a very different proposition at 55 kg than at
 * 110 kg. Offsets are proportional to TDEE for the same reason, but capped in
 * absolute terms so a high-expenditure user is not handed a 700 kcal surplus.
 *
 * Reference: docs/SCIENTIFIC_RULES.md §2.
 */

import { clamp, roundTo } from '@/utils/number';
import type { ExperienceLevel, GoalType } from '@/types/domain';

export interface RateBand {
  /** Percent of bodyweight per week. Negative means loss. */
  minPercentPerWeek: number;
  maxPercentPerWeek: number;
}

export const GOAL_RATE_BANDS: Record<GoalType, RateBand> = {
  lean_bulk: { minPercentPerWeek: 0.25, maxPercentPerWeek: 0.5 },
  recomposition: { minPercentPerWeek: -0.1, maxPercentPerWeek: 0.1 },
  cut: { minPercentPerWeek: -1.0, maxPercentPerWeek: -0.5 },
  maintenance: { minPercentPerWeek: -0.1, maxPercentPerWeek: 0.1 },
};

interface GoalOffsetRule {
  /** Fraction of TDEE. Positive is a surplus. */
  fractionOfTdee: number;
  /** Absolute cap on the offset magnitude, in kcal. */
  capKcal: number;
}

const GOAL_OFFSET_RULES: Record<GoalType, GoalOffsetRule> = {
  lean_bulk: { fractionOfTdee: 0.1, capKcal: 350 },
  recomposition: { fractionOfTdee: -0.05, capKcal: 250 },
  cut: { fractionOfTdee: -0.2, capKcal: 750 },
  maintenance: { fractionOfTdee: 0, capKcal: 0 },
};

/**
 * Advanced trainees sit at the conservative end of a bulk: they cannot build
 * muscle fast enough to use a larger surplus, so the extra energy is fat.
 * Beginners can afford slightly more.
 */
const EXPERIENCE_BULK_SCALING: Record<ExperienceLevel, number> = {
  beginner: 1.0,
  intermediate: 0.85,
  advanced: 0.7,
};

export interface GoalTargetInput {
  goal: GoalType;
  tdeeKcal: number;
  weightKg: number;
  experience: ExperienceLevel;
}

export interface GoalTargetResult {
  /** Signed energy offset from TDEE, in kcal, rounded to 10. */
  energyOffsetKcal: number;
  /** TDEE + offset, before safety clamping. */
  rawTargetKcal: number;
  /** Midpoint of the goal's rate band, in kg per week. */
  targetRateKgPerWeek: number;
  rateBand: RateBand;
}

export function goalEnergyOffset(input: GoalTargetInput): number {
  const rule = GOAL_OFFSET_RULES[input.goal];
  const scaling = input.goal === 'lean_bulk' ? EXPERIENCE_BULK_SCALING[input.experience] : 1;

  const raw = input.tdeeKcal * rule.fractionOfTdee * scaling;
  const capped = clamp(raw, -rule.capKcal, rule.capKcal);
  return roundTo(capped, 10);
}

export function targetRateKgPerWeek(goal: GoalType, weightKg: number): number {
  const band = GOAL_RATE_BANDS[goal];
  const midpointPercent = (band.minPercentPerWeek + band.maxPercentPerWeek) / 2;
  return (midpointPercent / 100) * weightKg;
}

export function computeGoalTarget(input: GoalTargetInput): GoalTargetResult {
  const energyOffsetKcal = goalEnergyOffset(input);
  return {
    energyOffsetKcal,
    rawTargetKcal: input.tdeeKcal + energyOffsetKcal,
    targetRateKgPerWeek: targetRateKgPerWeek(input.goal, input.weightKg),
    rateBand: GOAL_RATE_BANDS[input.goal],
  };
}

/**
 * Whether an observed rate of weight change sits inside the goal's intended
 * band. Used by the weekly check-in to decide whether anything needs to change
 * at all — "no change required" is a valid and common answer.
 */
export function isRateOnTarget(
  goal: GoalType,
  observedKgPerWeek: number,
  weightKg: number,
): boolean {
  const band = GOAL_RATE_BANDS[goal];
  const observedPercent = (observedKgPerWeek / weightKg) * 100;
  // A small tolerance, because weight-trend estimates are themselves noisy.
  const tolerance = 0.05;
  return (
    observedPercent >= band.minPercentPerWeek - tolerance &&
    observedPercent <= band.maxPercentPerWeek + tolerance
  );
}

export const GOAL_LABELS: Record<GoalType, string> = {
  lean_bulk: 'Lean Bulk',
  recomposition: 'Recomposition',
  cut: 'Cut',
  maintenance: 'Maintenance',
};

export const GOAL_DESCRIPTIONS: Record<GoalType, string> = {
  lean_bulk:
    'A controlled surplus to build muscle with minimal fat gain. Slower is better here — faster gain is mostly fat.',
  recomposition:
    'Around maintenance, prioritising protein and training quality. Most effective for beginners, returners, and those with higher body fat.',
  cut: 'A moderate deficit that protects training performance and lean mass. No crash dieting.',
  maintenance: 'Hold your current weight while training and recovering well.',
};
