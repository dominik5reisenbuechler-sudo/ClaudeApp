/**
 * Macronutrient targets.
 *
 * Order of allocation is deliberate and reflects priority: protein is set
 * first from bodyweight (or lean mass), fat is set next and defended by a hard
 * floor, and carbohydrate takes whatever remains. Carbohydrate is the residual
 * because it is the macro with the widest tolerable range, not because it
 * matters least — in a training context it is the primary fuel.
 *
 * Reference: docs/SCIENTIFIC_RULES.md §3.
 */

import { clamp, roundTo } from '@/utils/number';
import type { DietType, GoalType, MacroTargets } from '@/types/domain';

export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARBS = 4;
export const KCAL_PER_G_FAT = 9;

/** g/kg/day. `SCIENTIFIC_RULES.md` §3.1. */
export const PROTEIN_G_PER_KG = {
  default: { min: 1.6, max: 2.2 },
  cut: { min: 2.0, max: 2.4 },
} as const;

export const FAT_MIN_G_PER_KG = 0.6;
export const FAT_MIN_PERCENT_ENERGY = 15;
export const FAT_DEFAULT_PERCENT_ENERGY = 27.5;

export const FIBER_G_PER_1000_KCAL = 14;
export const FIBER_MAX_G = 50;

/**
 * Plant-forward diets get a modest protein uplift: typical plant sources are
 * lower in leucine and slightly less digestible, so the same gram total does
 * less work.
 */
const DIET_PROTEIN_MULTIPLIER: Partial<Record<DietType, number>> = {
  vegan: 1.1,
  vegetarian: 1.05,
};

/** Above this body-fat percentage, protein is computed from lean mass instead. */
const HIGH_BODY_FAT_THRESHOLD = 25;

export interface MacroTargetInput {
  energyKcal: number;
  weightKg: number;
  goal: GoalType;
  dietType: DietType;
  /** Percentage, 0–100. Optional; only used when high enough to matter. */
  bodyFatPercent?: number | null;
  /**
   * Where in the protein band to sit, 0 = minimum, 1 = maximum. Defaults to the
   * middle. Exposed so a user preference can move it without changing the rule.
   */
  proteinBandPosition?: number;
  /** Fraction of energy from fat. Defaults to `FAT_DEFAULT_PERCENT_ENERGY`. */
  fatPercentOfEnergy?: number;
}

export interface MacroTargetResult extends MacroTargets {
  proteinGPerKg: number;
  /** True when the fat floor overrode the requested fat percentage. */
  fatFloorApplied: boolean;
  /**
   * True when protein + fat alone exceeded the energy budget, leaving no room
   * for carbohydrate. Signals a target that is too low to be sensible.
   */
  energyBudgetExceeded: boolean;
}

/**
 * Bodyweight to compute protein from. At higher body fat, total weight inflates
 * the target without benefit, so lean mass plus a margin is used instead.
 */
export function proteinReferenceWeightKg(weightKg: number, bodyFatPercent?: number | null): number {
  if (typeof bodyFatPercent !== 'number' || bodyFatPercent < HIGH_BODY_FAT_THRESHOLD) {
    return weightKg;
  }
  const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
  // Lean mass plus a quarter of fat mass: metabolically active tissue is not
  // exclusively lean, and pure-LBM targets read as implausibly low to users.
  const fatMassKg = weightKg - leanMassKg;
  return leanMassKg + fatMassKg * 0.25;
}

export function proteinTargetG(input: MacroTargetInput): number {
  const band = input.goal === 'cut' ? PROTEIN_G_PER_KG.cut : PROTEIN_G_PER_KG.default;
  const position = clamp(input.proteinBandPosition ?? 0.5, 0, 1);
  const perKg = band.min + (band.max - band.min) * position;

  const multiplier = DIET_PROTEIN_MULTIPLIER[input.dietType] ?? 1;
  const referenceWeight = proteinReferenceWeightKg(input.weightKg, input.bodyFatPercent);

  return perKg * multiplier * referenceWeight;
}

export function fatTargetG(input: {
  energyKcal: number;
  weightKg: number;
  fatPercentOfEnergy?: number;
}): { fatG: number; floorApplied: boolean } {
  const requestedPercent = input.fatPercentOfEnergy ?? FAT_DEFAULT_PERCENT_ENERGY;
  const fromPercent = (input.energyKcal * (requestedPercent / 100)) / KCAL_PER_G_FAT;

  const floorFromWeight = input.weightKg * FAT_MIN_G_PER_KG;
  const floorFromEnergy = (input.energyKcal * (FAT_MIN_PERCENT_ENERGY / 100)) / KCAL_PER_G_FAT;
  const floor = Math.max(floorFromWeight, floorFromEnergy);

  if (fromPercent < floor) return { fatG: floor, floorApplied: true };
  return { fatG: fromPercent, floorApplied: false };
}

export function fiberTargetG(energyKcal: number): number {
  return Math.min((energyKcal / 1000) * FIBER_G_PER_1000_KCAL, FIBER_MAX_G);
}

/**
 * Compute the full macro breakdown. Values are rounded to 5 g and calories to
 * 10 kcal, because these numbers are advice a human acts on, not a ledger.
 *
 * The returned `energyKcal` is the *requested* budget, not the sum of the
 * rounded macros — those differ by a few kcal and the budget is the number the
 * user is tracking against.
 */
export function computeMacroTargets(input: MacroTargetInput): MacroTargetResult {
  const rawProteinG = proteinTargetG(input);
  const { fatG: rawFatG, floorApplied } = fatTargetG(input);

  const proteinKcal = rawProteinG * KCAL_PER_G_PROTEIN;
  const fatKcal = rawFatG * KCAL_PER_G_FAT;
  const remainingKcal = input.energyKcal - proteinKcal - fatKcal;

  const energyBudgetExceeded = remainingKcal < 0;
  const rawCarbsG = Math.max(0, remainingKcal) / KCAL_PER_G_CARBS;

  return {
    energyKcal: roundTo(input.energyKcal, 10),
    proteinG: roundTo(rawProteinG, 5),
    carbsG: roundTo(rawCarbsG, 5),
    fatG: roundTo(rawFatG, 5),
    fiberG: roundTo(fiberTargetG(input.energyKcal), 5),
    proteinGPerKg:
      Math.round((rawProteinG / proteinReferenceWeightKg(input.weightKg, input.bodyFatPercent)) * 100) /
      100,
    fatFloorApplied: floorApplied,
    energyBudgetExceeded,
  };
}

/** Energy represented by a macro breakdown, using Atwater factors. */
export function energyFromMacros(macros: {
  proteinG: number;
  carbsG: number;
  fatG: number;
}): number {
  return (
    macros.proteinG * KCAL_PER_G_PROTEIN +
    macros.carbsG * KCAL_PER_G_CARBS +
    macros.fatG * KCAL_PER_G_FAT
  );
}
