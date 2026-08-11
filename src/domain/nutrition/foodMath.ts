/**
 * Scaling food nutrition to a logged quantity, and sanity-checking the data
 * that arrives from outside.
 *
 * `null` means "we do not know this value", and it propagates. It is never
 * coerced to zero: a protein figure of `0 g` and an unknown protein figure look
 * identical on screen once that happens, and the user has no way to tell that
 * their protein total is understated (CLAUDE.md §12, §60).
 */

import { energyFromMacros } from './macros';

export interface FoodNutrition {
  /** Required — a food with no energy value cannot be tracked. */
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
}

export interface EntryNutrition {
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

const scale = (per100g: number | null, grams: number): number | null =>
  per100g === null ? null : round1((per100g * grams) / 100);

/** Nutrition for an arbitrary mass of a food, in grams. */
export function nutritionForGrams(food: FoodNutrition, grams: number): EntryNutrition {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new Error('nutritionForGrams: grams must be a non-negative number');
  }

  return {
    energyKcal: round1((food.caloriesPer100g * grams) / 100),
    proteinG: scale(food.proteinPer100g, grams),
    carbsG: scale(food.carbsPer100g, grams),
    fatG: scale(food.fatPer100g, grams),
    fiberG: scale(food.fiberPer100g, grams),
  };
}

/**
 * Nutrition for a number of declared servings.
 *
 * Returns `null` when the food declares no serving size — a package that does
 * not state its serving cannot be logged "by serving", and guessing one would
 * silently invent the user's intake.
 */
export function nutritionForServings(
  food: FoodNutrition,
  servingSizeG: number | null,
  servings: number,
): EntryNutrition | null {
  if (servingSizeG === null || servingSizeG <= 0) return null;
  return nutritionForGrams(food, servingSizeG * servings);
}

export type FoodDataIssue =
  | 'macros_exceed_mass'
  | 'energy_mismatch'
  | 'missing_macros'
  | 'implausible_energy';

/**
 * Cheap plausibility checks on food data before it is trusted.
 *
 * Barcode databases are crowd-sourced and routinely contain values entered in
 * the wrong unit or the wrong column. These checks do not reject the food —
 * the user may well know better — but they let the UI say "this looks off"
 * instead of silently logging a chicken breast at 3,100 kcal.
 */
export function validateFoodData(food: FoodNutrition): FoodDataIssue[] {
  const issues: FoodDataIssue[] = [];

  const { proteinPer100g: p, carbsPer100g: c, fatPer100g: f } = food;

  if (p === null || c === null || f === null) issues.push('missing_macros');

  // Pure fat is ~900 kcal/100 g; anything above that is not a food.
  if (food.caloriesPer100g > 900) issues.push('implausible_energy');

  if (p !== null && c !== null && f !== null) {
    if (p + c + f > 100.5) issues.push('macros_exceed_mass');

    const computed = energyFromMacros({ proteinG: p, carbsG: c, fatG: f });
    // A 25% band. Fibre is counted inside carbohydrate but yields roughly 2
    // kcal/g rather than 4, and polyols behave differently again, so an exact
    // match is not expected even for correct data.
    if (food.caloriesPer100g > 0) {
      const deviation = Math.abs(computed - food.caloriesPer100g) / food.caloriesPer100g;
      if (deviation > 0.25) issues.push('energy_mismatch');
    }
  }

  return issues;
}

export const FOOD_DATA_ISSUE_MESSAGES: Record<FoodDataIssue, string> = {
  missing_macros:
    'This product is missing some nutrition values. Anything unknown is left blank rather than counted as zero, so your daily totals will say they are incomplete.',
  macros_exceed_mass:
    'The protein, carbs and fat listed add up to more than 100 g per 100 g, which is not possible. Please check the label before logging.',
  energy_mismatch:
    'The calories listed do not match the protein, carbs and fat. One of the values is probably wrong — worth checking the label.',
  implausible_energy:
    'The calorie figure is higher than any food can be. Please check the label before logging.',
};

const round1 = (value: number): number => Math.round(value * 10) / 10;
