/**
 * Safety guards for calorie advice.
 *
 * This is a fitness app, not medical software (CLAUDE.md §55). The rules here
 * are hard limits: the calorie engine routes through `enforceCalorieFloor`, and
 * no caller may bypass it. Where the maths and the floor disagree, the floor
 * wins and the *rate* is relaxed instead — a user who wants to lose faster gets
 * a slower plan, never a dangerous one.
 *
 * Reference: docs/SCIENTIFIC_RULES.md §2.1.
 */

import type { GoalType, Sex } from '@/types/domain';

export const MIN_KCAL_BY_SEX: Record<Sex, number> = { male: 1500, female: 1200 };
export const MIN_KCAL_BMR_MULTIPLE = 1.1;

export const MINOR_AGE_THRESHOLD = 18;
export const LOW_BMI_THRESHOLD = 18.5;

export type SafetyFlagCode =
  | 'minor'
  | 'pregnancy_or_breastfeeding'
  | 'low_bmi'
  | 'eating_disorder_risk'
  | 'medical_condition'
  | 'acute_symptoms';

export type SafetySeverity = 'block_deficit' | 'warn';

export interface SafetyFlag {
  code: SafetyFlagCode;
  severity: SafetySeverity;
  message: string;
}

export interface SafetyScreeningInput {
  ageYears: number;
  sex: Sex;
  weightKg: number;
  heightCm: number;
  isPregnantOrBreastfeeding?: boolean;
  hasMedicalCondition?: boolean;
  /**
   * Set when the user reports a current or past eating disorder, or when
   * onboarding screening answers indicate risk.
   */
  eatingDisorderRisk?: boolean;
  /** Chest pain, dizziness, or similar reported during onboarding. */
  reportsAcuteSymptoms?: boolean;
}

export function bmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) throw new Error('bmi: heightCm must be positive');
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

/**
 * Collect the reasons the app must not hand this user a deficit — or must at
 * least say something first. Returned as a list rather than a boolean so the UI
 * can explain every applicable reason instead of the first one found.
 */
export function screenForSafety(input: SafetyScreeningInput): SafetyFlag[] {
  const flags: SafetyFlag[] = [];

  if (input.ageYears < MINOR_AGE_THRESHOLD) {
    flags.push({
      code: 'minor',
      severity: 'block_deficit',
      message:
        'You are under 18. Growth and development change what a healthy intake looks like, so we will not set a calorie deficit. Please involve a parent or guardian and a doctor or registered dietitian.',
    });
  }

  if (input.isPregnantOrBreastfeeding) {
    flags.push({
      code: 'pregnancy_or_breastfeeding',
      severity: 'block_deficit',
      message:
        'Energy needs during pregnancy and breastfeeding are individual and clinically supervised. We will not set a calorie deficit — please work with your healthcare provider.',
    });
  }

  if (bmi(input.weightKg, input.heightCm) < LOW_BMI_THRESHOLD) {
    flags.push({
      code: 'low_bmi',
      severity: 'block_deficit',
      message:
        'Your current height and weight put you below the typical healthy weight range, so we will not recommend a calorie deficit. If losing weight is a goal, please speak to a doctor first.',
    });
  }

  if (input.eatingDisorderRisk) {
    flags.push({
      code: 'eating_disorder_risk',
      severity: 'block_deficit',
      message:
        'Calorie tracking is not helpful for everyone, and can be harmful during or after an eating disorder. We will not set a weight-loss target. Support is available — please consider speaking to a professional.',
    });
  }

  if (input.hasMedicalCondition) {
    flags.push({
      code: 'medical_condition',
      severity: 'warn',
      message:
        'You mentioned a medical condition. This app gives general fitness guidance and cannot account for medical needs — please check these targets with your doctor.',
    });
  }

  if (input.reportsAcuteSymptoms) {
    flags.push({
      code: 'acute_symptoms',
      severity: 'warn',
      message:
        'You reported symptoms such as chest pain or dizziness. Please seek medical advice before starting or continuing a training programme.',
    });
  }

  return flags;
}

export function blocksDeficit(flags: readonly SafetyFlag[]): boolean {
  return flags.some((flag) => flag.severity === 'block_deficit');
}

/**
 * The lowest calorie target the app is permitted to recommend: the greater of
 * the absolute floor for the user's sex and a multiple of their BMR.
 */
export function calorieFloor(sex: Sex, bmrKcal: number): number {
  return Math.max(MIN_KCAL_BY_SEX[sex], Math.round(bmrKcal * MIN_KCAL_BMR_MULTIPLE));
}

export interface CalorieFloorResult {
  energyKcal: number;
  floorKcal: number;
  /** True when the requested target was below the floor and has been raised. */
  wasClamped: boolean;
}

export function enforceCalorieFloor(
  requestedKcal: number,
  sex: Sex,
  bmrKcal: number,
): CalorieFloorResult {
  const floorKcal = calorieFloor(sex, bmrKcal);
  if (requestedKcal >= floorKcal) {
    return { energyKcal: requestedKcal, floorKcal, wasClamped: false };
  }
  return { energyKcal: floorKcal, floorKcal, wasClamped: true };
}

/**
 * The goal the app will actually pursue, after safety screening. A user flagged
 * for `block_deficit` who selected `cut` is moved to `maintenance` rather than
 * being refused outright — they keep a usable app, without a deficit.
 */
export function resolveSafeGoal(requested: GoalType, flags: readonly SafetyFlag[]): GoalType {
  if (!blocksDeficit(flags)) return requested;
  if (requested === 'cut' || requested === 'recomposition') return 'maintenance';
  return requested;
}
