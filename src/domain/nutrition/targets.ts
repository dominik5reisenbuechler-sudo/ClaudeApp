/**
 * Composition of the whole initial-target pipeline:
 *
 *   BMR → initial TDEE → goal offset → safety clamp → macros → explanation
 *
 * This is the single entry point onboarding calls. Screens never call the
 * individual stages themselves, so there is exactly one place where the order
 * of operations lives — in particular, the safety clamp always runs *after* the
 * goal offset and *before* macros, so a clamped calorie target produces macros
 * for the clamped number rather than the dangerous one.
 */

import { estimateBmr, estimateInitialTdee } from './energy';
import type { BmrResult, InitialTdeeBreakdown } from './energy';
import { computeGoalTarget, GOAL_LABELS } from './goalAdjustment';
import type { GoalTargetResult } from './goalAdjustment';
import { computeMacroTargets } from './macros';
import type { MacroTargetResult } from './macros';
import { enforceCalorieFloor, resolveSafeGoal, screenForSafety } from './safety';
import type { SafetyFlag, SafetyScreeningInput } from './safety';
import { roundTo } from '@/utils/number';
import type {
  ActivityLevel,
  DietType,
  ExperienceLevel,
  GoalType,
  OccupationActivity,
  Sex,
} from '@/types/domain';

export interface InitialTargetInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  bodyFatPercent?: number | null;
  bodyFatIsMeasured?: boolean;

  occupation: OccupationActivity;
  activityLevel: ActivityLevel;
  averageDailySteps: number;

  experience: ExperienceLevel;
  trainingDaysPerWeek: number;
  sessionMinutes: number;
  cardioMinutesPerWeek?: number;

  goal: GoalType;
  dietType: DietType;

  screening?: Omit<SafetyScreeningInput, 'ageYears' | 'sex' | 'weightKg' | 'heightCm'>;
}

export interface InitialTargetResult {
  bmr: BmrResult;
  tdee: InitialTdeeBreakdown;
  goalTarget: GoalTargetResult;
  /** The goal actually applied, which may differ from the requested one. */
  resolvedGoal: GoalType;
  requestedGoal: GoalType;
  safetyFlags: SafetyFlag[];
  macros: MacroTargetResult;
  energyKcal: number;
  floorKcal: number;
  calorieFloorApplied: boolean;
  stepGoal: number;
  /** Human-readable derivation, shown on the review step and stored. */
  explanation: string;
  /** Serialisable inputs + intermediate values, persisted to `user_targets.basis`. */
  basis: Record<string, unknown>;
}

/**
 * Step goal: nudge upward from the user's current average rather than imposing
 * 10 000. Someone averaging 3 000 steps is not helped by a goal they will miss
 * every day; someone already at 12 000 is not helped by one they beat by lunch.
 */
export function suggestStepGoal(averageDailySteps: number): number {
  const nudged = averageDailySteps * 1.1;
  const floor = 6000;
  const ceiling = 14000;
  return roundTo(Math.min(Math.max(nudged, floor), ceiling), 500);
}

export function computeInitialTargets(input: InitialTargetInput): InitialTargetResult {
  const bmr = estimateBmr({
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    ageYears: input.ageYears,
    bodyFatPercent: input.bodyFatPercent,
    bodyFatIsMeasured: input.bodyFatIsMeasured,
  });

  const tdee = estimateInitialTdee({
    bmrKcal: bmr.bmrKcal,
    weightKg: input.weightKg,
    occupation: input.occupation,
    activityLevel: input.activityLevel,
    averageDailySteps: input.averageDailySteps,
    trainingDaysPerWeek: input.trainingDaysPerWeek,
    sessionMinutes: input.sessionMinutes,
    ...(input.cardioMinutesPerWeek !== undefined
      ? { cardioMinutesPerWeek: input.cardioMinutesPerWeek }
      : {}),
  });

  const safetyFlags = screenForSafety({
    ageYears: input.ageYears,
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    ...input.screening,
  });

  const resolvedGoal = resolveSafeGoal(input.goal, safetyFlags);

  const goalTarget = computeGoalTarget({
    goal: resolvedGoal,
    tdeeKcal: tdee.tdeeKcal,
    weightKg: input.weightKg,
    experience: input.experience,
  });

  const floorResult = enforceCalorieFloor(goalTarget.rawTargetKcal, input.sex, bmr.bmrKcal);
  const energyKcal = roundTo(floorResult.energyKcal, 10);

  const macros = computeMacroTargets({
    energyKcal,
    weightKg: input.weightKg,
    goal: resolvedGoal,
    dietType: input.dietType,
    bodyFatPercent: input.bodyFatPercent,
  });

  const stepGoal = suggestStepGoal(input.averageDailySteps);

  const explanation = buildExplanation({
    bmr,
    tdee,
    goalTarget,
    resolvedGoal,
    requestedGoal: input.goal,
    energyKcal,
    macros,
    calorieFloorApplied: floorResult.wasClamped,
  });

  return {
    bmr,
    tdee,
    goalTarget,
    resolvedGoal,
    requestedGoal: input.goal,
    safetyFlags,
    macros,
    energyKcal,
    floorKcal: floorResult.floorKcal,
    calorieFloorApplied: floorResult.wasClamped,
    stepGoal,
    explanation,
    basis: {
      version: 1,
      inputs: {
        sex: input.sex,
        ageYears: input.ageYears,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        bodyFatPercent: input.bodyFatPercent ?? null,
        occupation: input.occupation,
        activityLevel: input.activityLevel,
        averageDailySteps: input.averageDailySteps,
        experience: input.experience,
        trainingDaysPerWeek: input.trainingDaysPerWeek,
        sessionMinutes: input.sessionMinutes,
        dietType: input.dietType,
        requestedGoal: input.goal,
      },
      derived: {
        bmrKcal: Math.round(bmr.bmrKcal),
        bmrEquation: bmr.equation,
        tdee,
        energyOffsetKcal: goalTarget.energyOffsetKcal,
        resolvedGoal,
        calorieFloorApplied: floorResult.wasClamped,
        floorKcal: floorResult.floorKcal,
      },
    },
  };
}

interface ExplanationInput {
  bmr: BmrResult;
  tdee: InitialTdeeBreakdown;
  goalTarget: GoalTargetResult;
  resolvedGoal: GoalType;
  requestedGoal: GoalType;
  energyKcal: number;
  macros: MacroTargetResult;
  calorieFloorApplied: boolean;
}

const EQUATION_LABELS: Record<BmrResult['equation'], string> = {
  mifflin_st_jeor: 'the Mifflin–St Jeor equation',
  katch_mcardle: 'the Katch–McArdle equation (using your measured body fat)',
};

/**
 * Assemble the "why?" text from the actual numbers used. An opaque
 * recommendation is a bug (CLAUDE.md §44), so this is built from the same
 * values that were computed, never from a template with invented figures.
 */
export function buildExplanation(input: ExplanationInput): string {
  const parts: string[] = [];

  parts.push(
    `We estimated your resting metabolic rate at about ${Math.round(
      input.bmr.bmrKcal,
    )} kcal using ${EQUATION_LABELS[input.bmr.equation]}.`,
  );

  parts.push(
    `Adding your daily activity (${input.tdee.baselineKcal} kcal baseline, ` +
      `${input.tdee.stepsKcal} kcal from steps, ${input.tdee.trainingKcal} kcal from training) ` +
      `gives an estimated daily expenditure of about ${input.tdee.tdeeKcal} kcal.`,
  );

  const offset = input.goalTarget.energyOffsetKcal;
  if (offset === 0) {
    parts.push(
      `For ${GOAL_LABELS[input.resolvedGoal]} we target roughly your estimated expenditure.`,
    );
  } else {
    const direction = offset > 0 ? 'added' : 'subtracted';
    parts.push(
      `For ${GOAL_LABELS[input.resolvedGoal]} we ${direction} ${Math.abs(offset)} kcal, ` +
        `aiming for about ${formatRate(input.goalTarget.targetRateKgPerWeek)} per week.`,
    );
  }

  if (input.resolvedGoal !== input.requestedGoal) {
    parts.push(
      `You selected ${GOAL_LABELS[input.requestedGoal]}, but based on your answers we have set ` +
        `${GOAL_LABELS[input.resolvedGoal]} instead — see the safety note above.`,
    );
  }

  if (input.calorieFloorApplied) {
    parts.push(
      `That calculation came out below the minimum intake we are willing to recommend, so your ` +
        `target has been raised to ${input.energyKcal} kcal. Progress will be slower, which is the ` +
        `right trade.`,
    );
  }

  parts.push(
    `Protein is set at ${input.macros.proteinG} g (about ${input.macros.proteinGPerKg} g/kg) ` +
      `to support muscle growth and retention, fat at ${input.macros.fatG} g, and the remaining ` +
      `energy goes to carbohydrate (${input.macros.carbsG} g) to fuel training.`,
  );

  parts.push(
    `These numbers are a starting estimate. Once you have logged your weight and food for a ` +
      `couple of weeks, we will replace the estimate with your real-world expenditure.`,
  );

  return parts.join(' ');
}

function formatRate(kgPerWeek: number): string {
  const rounded = Math.round(Math.abs(kgPerWeek) * 100) / 100;
  if (rounded < 0.01) return 'a stable bodyweight';
  return `${kgPerWeek > 0 ? '+' : '−'}${rounded} kg`;
}
