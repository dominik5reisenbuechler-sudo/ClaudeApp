/**
 * Energy expenditure estimation.
 *
 * Everything here is a *population-level estimate*. Individual error on a
 * predictive BMR equation is roughly ±10%, and the activity terms are coarser
 * still. That is not a defect to be engineered away — it is the reason the
 * adaptive estimator (Phase 8) exists. The job of this module is to produce a
 * defensible day-one number and to be explicit that it is a starting point.
 *
 * Reference: docs/SCIENTIFIC_RULES.md §1.
 */

import type { OccupationActivity, ActivityLevel, Sex } from '@/types/domain';

export type BmrEquation = 'mifflin_st_jeor' | 'katch_mcardle';

export interface BmrInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  /** Percentage, 0–100. Only used when `bodyFatIsMeasured` is true. */
  bodyFatPercent?: number | null;
  /**
   * True only for DEXA/BIA-style measurement. Self-estimated body fat is not
   * accurate enough to justify switching equations, so a guess is ignored
   * rather than quietly changing the user's calorie target.
   */
  bodyFatIsMeasured?: boolean;
}

export interface BmrResult {
  bmrKcal: number;
  equation: BmrEquation;
}

/**
 * Mifflin–St Jeor. The default: more accurate than Harris–Benedict in modern
 * populations and it needs only data every user can supply.
 */
export function mifflinStJeor(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  return input.sex === 'male' ? base + 5 : base - 161;
}

/**
 * Katch–McArdle. Predicts from lean mass, which removes the sex/adiposity
 * confound — but only if the body-fat figure is real.
 */
export function katchMcArdle(input: { weightKg: number; bodyFatPercent: number }): number {
  const leanMassKg = input.weightKg * (1 - input.bodyFatPercent / 100);
  return 370 + 21.6 * leanMassKg;
}

export function estimateBmr(input: BmrInput): BmrResult {
  const { bodyFatPercent, bodyFatIsMeasured, weightKg } = input;

  const canUseBodyFat =
    bodyFatIsMeasured === true &&
    typeof bodyFatPercent === 'number' &&
    bodyFatPercent > 3 &&
    bodyFatPercent < 60;

  if (canUseBodyFat) {
    return {
      bmrKcal: katchMcArdle({ weightKg, bodyFatPercent: bodyFatPercent as number }),
      equation: 'katch_mcardle',
    };
  }

  return { bmrKcal: mifflinStJeor(input), equation: 'mifflin_st_jeor' };
}

/**
 * Occupation-driven baseline multiplier. Covers work and background NEAT only —
 * deliberately *not* steps or training, which are counted separately so the
 * user can see where their expenditure comes from.
 */
export const OCCUPATION_FACTORS: Record<OccupationActivity, number> = {
  desk: 1.15,
  light: 1.25,
  active: 1.35,
  manual: 1.5,
};

/**
 * Additive bonus for leisure-time activity that a step count does not capture
 * (cycling, swimming, sport, manual hobbies). Kept small precisely because it
 * overlaps with the step term, and double-counting activity is the classic way
 * these estimates run high.
 */
export const LEISURE_ACTIVITY_BONUS: Record<ActivityLevel, number> = {
  sedentary: 0,
  light: 0.03,
  moderate: 0.06,
  high: 0.09,
  very_high: 0.12,
};

/** kcal per kg of bodyweight per 1 000 steps, above the baseline. */
export const STEP_ENERGY_KCAL_PER_KG_PER_1000 = 0.04;

/**
 * Steps already accounted for by the occupation factor. Only steps above this
 * are added, otherwise a desk worker's incidental walking is counted twice.
 */
export const STEP_BASELINE = 3000;

/** kcal per minute of resistance training at typical hypertrophy intensities. */
export const RESISTANCE_TRAINING_KCAL_PER_MIN = 5;

/** kcal per minute of moderate cardio, per kg of bodyweight. */
export const CARDIO_KCAL_PER_KG_PER_MIN = 0.075;

export interface InitialTdeeInput {
  bmrKcal: number;
  weightKg: number;
  occupation: OccupationActivity;
  activityLevel: ActivityLevel;
  averageDailySteps: number;
  trainingDaysPerWeek: number;
  sessionMinutes: number;
  /** Optional dedicated cardio, in minutes across the whole week. */
  cardioMinutesPerWeek?: number;
}

export interface InitialTdeeBreakdown {
  /** BMR × (occupation factor + leisure bonus). */
  baselineKcal: number;
  /** Daily average energy from steps above the baseline. */
  stepsKcal: number;
  /** Weekly resistance-training energy, amortised across seven days. */
  trainingKcal: number;
  /** Weekly cardio energy, amortised across seven days. */
  cardioKcal: number;
  /** Sum of the above, rounded to 10 kcal. */
  tdeeKcal: number;
  /**
   * Always `true` for this function. Carried in the result so that UI which
   * receives a TDEE cannot forget to label it — a predicted TDEE and a measured
   * one must never look the same to the user.
   */
  isEstimate: true;
}

/**
 * Build an initial TDEE additively rather than from a single lifestyle
 * multiplier. A single multiplier conflates occupation, walking and training,
 * which makes it impossible to explain the number back to the user or to
 * adjust one component when their circumstances change.
 */
export function estimateInitialTdee(input: InitialTdeeInput): InitialTdeeBreakdown {
  const {
    bmrKcal,
    weightKg,
    occupation,
    activityLevel,
    averageDailySteps,
    trainingDaysPerWeek,
    sessionMinutes,
    cardioMinutesPerWeek = 0,
  } = input;

  const factor = OCCUPATION_FACTORS[occupation] + LEISURE_ACTIVITY_BONUS[activityLevel];
  const baselineKcal = bmrKcal * factor;

  const stepsAboveBaseline = Math.max(0, averageDailySteps - STEP_BASELINE);
  const stepsKcal =
    (stepsAboveBaseline / 1000) * STEP_ENERGY_KCAL_PER_KG_PER_1000 * weightKg;

  const weeklyTrainingKcal =
    trainingDaysPerWeek * sessionMinutes * RESISTANCE_TRAINING_KCAL_PER_MIN;
  const trainingKcal = weeklyTrainingKcal / 7;

  const weeklyCardioKcal = cardioMinutesPerWeek * CARDIO_KCAL_PER_KG_PER_MIN * weightKg;
  const cardioKcal = weeklyCardioKcal / 7;

  const total = baselineKcal + stepsKcal + trainingKcal + cardioKcal;

  return {
    baselineKcal: Math.round(baselineKcal),
    stepsKcal: Math.round(stepsKcal),
    trainingKcal: Math.round(trainingKcal),
    cardioKcal: Math.round(cardioKcal),
    tdeeKcal: Math.round(total / 10) * 10,
    isEstimate: true,
  };
}

/**
 * Energy content of one kilogram of body-mass change. A convention, not a
 * constant of nature — early change in any new phase is disproportionately
 * glycogen and water, which is why the adaptive estimator discounts the first
 * days of a phase.
 */
export const KCAL_PER_KG_BODY_MASS = 7700;
