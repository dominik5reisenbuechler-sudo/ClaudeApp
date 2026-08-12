/**
 * Recipe portion scaling.
 *
 * Two things make this more than a multiplication:
 *
 *   1. Some quantities must not scale. A pinch of salt, the oil that greases
 *      one tray, the spices that season a dish rather than fill it — doubling
 *      those with the servings produces a recipe nobody would cook. They are
 *      marked `isScalable: false` and pass through untouched.
 *
 *   2. The result has to be a quantity a person can actually measure. 133.33 g
 *      of rice is arithmetically correct and useless in a kitchen; 135 g is
 *      both. Rounding is therefore per-unit, not a fixed number of decimals.
 */

import type { EntryNutrition } from './foodMath';

export interface RecipeIngredient {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  preparationNote: string | null;
  isScalable: boolean;
  isOptional: boolean;
}

export interface RecipeNutrition {
  caloriesPerServing: number;
  proteinPerServing: number | null;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  fiberPerServing: number | null;
}

export interface ScalableRecipe extends RecipeNutrition {
  servings: number;
  ingredients: readonly RecipeIngredient[];
}

export interface ScaledRecipe {
  /** Servings the user asked for. */
  servings: number;
  /** `servings / recipe.servings`. */
  factor: number;
  ingredients: RecipeIngredient[];
  /** Nutrition for one serving — unchanged by scaling, by definition. */
  perServing: EntryNutrition;
  /** Nutrition for all `servings` requested. */
  total: EntryNutrition;
  /** True when at least one ingredient was held fixed. */
  hasFixedIngredients: boolean;
}

const COUNT_UNITS = new Set(['piece', 'pieces', 'slice', 'slices', 'clove', 'cloves', 'egg', 'eggs']);
const SPOON_UNITS = new Set(['tsp', 'tbsp']);
const FINE_UNITS = new Set(['g', 'ml']);
const COARSE_UNITS = new Set(['kg', 'l']);

/**
 * Round a scaled quantity to something measurable in a kitchen.
 *
 * Exported because the meal planner (phase 5) scales the same way, and two
 * implementations of "what is a sensible amount of rice" would drift.
 */
export function roundQuantityForUnit(amount: number, unit: string): number {
  const normalized = unit.trim().toLowerCase();

  if (COUNT_UNITS.has(normalized)) {
    // Half a chicken breast is realistic; a fifth of an egg is not.
    return Math.max(0.5, Math.round(amount * 2) / 2);
  }

  if (SPOON_UNITS.has(normalized)) {
    return Math.max(0.25, Math.round(amount * 4) / 4);
  }

  if (FINE_UNITS.has(normalized)) {
    // Above 50 g/ml nobody weighs to the gram; below it, precision matters.
    return amount >= 50 ? Math.round(amount / 5) * 5 : Math.max(1, Math.round(amount));
  }

  if (COARSE_UNITS.has(normalized)) {
    return Math.round(amount * 20) / 20;
  }

  return Math.round(amount * 4) / 4;
}

export function scaleIngredient(
  ingredient: RecipeIngredient,
  factor: number,
): RecipeIngredient {
  if (!ingredient.isScalable) return { ...ingredient };
  return {
    ...ingredient,
    quantity: roundQuantityForUnit(ingredient.quantity * factor, ingredient.unit),
  };
}

const scaleNutrient = (value: number | null, factor: number): number | null =>
  value === null ? null : round1(value * factor);

/**
 * Scale a recipe to a number of servings.
 *
 * `targetServings` may be fractional — half a portion is an ordinary thing to
 * want — but must be positive.
 */
export function scaleRecipe(recipe: ScalableRecipe, targetServings: number): ScaledRecipe {
  if (!Number.isFinite(targetServings) || targetServings <= 0) {
    throw new Error('scaleRecipe: targetServings must be a positive number');
  }
  if (recipe.servings <= 0) {
    throw new Error('scaleRecipe: recipe.servings must be positive');
  }

  const factor = targetServings / recipe.servings;

  const perServing: EntryNutrition = {
    energyKcal: round1(recipe.caloriesPerServing),
    proteinG: scaleNutrient(recipe.proteinPerServing, 1),
    carbsG: scaleNutrient(recipe.carbsPerServing, 1),
    fatG: scaleNutrient(recipe.fatPerServing, 1),
    fiberG: scaleNutrient(recipe.fiberPerServing, 1),
  };

  return {
    servings: targetServings,
    factor,
    ingredients: recipe.ingredients.map((ingredient) => scaleIngredient(ingredient, factor)),
    perServing,
    total: {
      // Nutrition scales with the servings eaten, not with the rounded
      // ingredient amounts — rounding is a kitchen convenience and must not
      // silently change what gets logged.
      energyKcal: round1(recipe.caloriesPerServing * targetServings),
      proteinG: scaleNutrient(recipe.proteinPerServing, targetServings),
      carbsG: scaleNutrient(recipe.carbsPerServing, targetServings),
      fatG: scaleNutrient(recipe.fatPerServing, targetServings),
      fiberG: scaleNutrient(recipe.fiberPerServing, targetServings),
    },
    hasFixedIngredients: recipe.ingredients.some((ingredient) => !ingredient.isScalable),
  };
}

/** Total active time. Used for the "under 15 minutes" filter and ranking. */
export function totalMinutes(recipe: { prepMinutes: number; cookMinutes: number }): number {
  return recipe.prepMinutes + recipe.cookMinutes;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
