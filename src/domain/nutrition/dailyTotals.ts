/**
 * Aggregating a day's food entries.
 *
 * The one rule that shapes everything here: an unknown nutrient is not zero.
 * Summing `null` as `0` produces a total that looks authoritative and is
 * silently too low, which is exactly the sort of number a user would then make
 * decisions against. Instead unknowns are skipped from the sum and the affected
 * nutrients are named in `incompleteNutrients`, so the UI can mark the total as
 * a lower bound.
 */

import { MEAL_TYPES } from '@/types/domain';
import type { MacroTargets, MealType } from '@/types/domain';

export type NutrientKey = 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';

const NUTRIENT_KEYS: readonly NutrientKey[] = ['proteinG', 'carbsG', 'fatG', 'fiberG'];

export interface LoggedEntry {
  mealType: MealType;
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

export interface NutrientTotals {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface DailyTotals extends NutrientTotals {
  entryCount: number;
  /**
   * Nutrients where at least one entry had no value. The totals for these are
   * lower bounds, and the UI must say so.
   */
  incompleteNutrients: NutrientKey[];
}

export const EMPTY_TOTALS: DailyTotals = {
  energyKcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  entryCount: 0,
  incompleteNutrients: [],
};

export function totalsFor(entries: readonly LoggedEntry[]): DailyTotals {
  const totals: NutrientTotals = {
    energyKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
  };
  const incomplete = new Set<NutrientKey>();

  for (const entry of entries) {
    totals.energyKcal += entry.energyKcal;
    for (const key of NUTRIENT_KEYS) {
      const value = entry[key];
      if (value === null) incomplete.add(key);
      else totals[key] += value;
    }
  }

  return {
    energyKcal: round1(totals.energyKcal),
    proteinG: round1(totals.proteinG),
    carbsG: round1(totals.carbsG),
    fatG: round1(totals.fatG),
    fiberG: round1(totals.fiberG),
    entryCount: entries.length,
    // Ordered by the canonical nutrient order rather than insertion order, so
    // the UI renders a stable list.
    incompleteNutrients: NUTRIENT_KEYS.filter((key) => incomplete.has(key)),
  };
}

/** Totals per meal, with every meal present so the UI can render empty slots. */
export function totalsByMeal(entries: readonly LoggedEntry[]): Record<MealType, DailyTotals> {
  const result = {} as Record<MealType, DailyTotals>;
  for (const meal of MEAL_TYPES) {
    result[meal] = totalsFor(entries.filter((entry) => entry.mealType === meal));
  }
  return result;
}

export interface RemainingTotals extends NutrientTotals {
  /** True where consumption has passed the target. */
  overBy: { energyKcal: boolean; proteinG: boolean; carbsG: boolean; fatG: boolean };
}

/**
 * Target minus consumed. Values go negative once a target is passed, because
 * "300 kcal over" is information the user needs — clamping at zero would hide
 * it behind a full progress bar.
 */
export function remainingAgainst(
  totals: NutrientTotals,
  targets: MacroTargets,
): RemainingTotals {
  return {
    energyKcal: round1(targets.energyKcal - totals.energyKcal),
    proteinG: round1(targets.proteinG - totals.proteinG),
    carbsG: round1(targets.carbsG - totals.carbsG),
    fatG: round1(targets.fatG - totals.fatG),
    fiberG: round1(targets.fiberG - totals.fiberG),
    overBy: {
      energyKcal: totals.energyKcal > targets.energyKcal,
      proteinG: totals.proteinG > targets.proteinG,
      carbsG: totals.carbsG > targets.carbsG,
      fatG: totals.fatG > targets.fatG,
    },
  };
}

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  proteinG: 'protein',
  carbsG: 'carbs',
  fatG: 'fat',
  fiberG: 'fibre',
};

const round1 = (value: number): number => Math.round(value * 10) / 10;
