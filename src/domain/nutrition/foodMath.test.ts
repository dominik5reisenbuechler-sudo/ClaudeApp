import { describe, expect, it } from 'vitest';

import { nutritionForGrams, nutritionForServings, validateFoodData } from './foodMath';
import type { FoodNutrition } from './foodMath';

const chickenBreast: FoodNutrition = {
  caloriesPer100g: 165,
  proteinPer100g: 31,
  carbsPer100g: 0,
  fatPer100g: 3.6,
  fiberPer100g: 0,
};

describe('nutritionForGrams', () => {
  it('scales linearly from the per-100 g figures', () => {
    expect(nutritionForGrams(chickenBreast, 200)).toEqual({
      energyKcal: 330,
      proteinG: 62,
      carbsG: 0,
      fatG: 7.2,
      fiberG: 0,
    });
  });

  it('handles a partial serving', () => {
    const result = nutritionForGrams(chickenBreast, 50);
    expect(result.energyKcal).toBe(82.5);
    expect(result.proteinG).toBe(15.5);
  });

  it('returns zeros for a zero quantity', () => {
    expect(nutritionForGrams(chickenBreast, 0).energyKcal).toBe(0);
  });

  it('propagates unknown values as null rather than zero', () => {
    // The difference matters: 0 g of protein and unknown protein look identical
    // on screen once null becomes 0, and the daily total is then quietly wrong.
    const incomplete: FoodNutrition = {
      caloriesPer100g: 250,
      proteinPer100g: null,
      carbsPer100g: 30,
      fatPer100g: null,
      fiberPer100g: null,
    };
    const result = nutritionForGrams(incomplete, 200);
    expect(result.energyKcal).toBe(500);
    expect(result.proteinG).toBeNull();
    expect(result.carbsG).toBe(60);
    expect(result.fatG).toBeNull();
    expect(result.fiberG).toBeNull();
  });

  it('rejects a negative or non-finite quantity', () => {
    expect(() => nutritionForGrams(chickenBreast, -10)).toThrow();
    expect(() => nutritionForGrams(chickenBreast, Number.NaN)).toThrow();
  });

  it('rounds to one decimal place', () => {
    const result = nutritionForGrams({ ...chickenBreast, caloriesPer100g: 123.456 }, 77);
    expect(result.energyKcal).toBe(95.1);
  });
});

describe('nutritionForServings', () => {
  it('multiplies out the declared serving size', () => {
    const result = nutritionForServings(chickenBreast, 150, 2);
    expect(result?.energyKcal).toBe(495);
  });

  it('refuses to guess when the food declares no serving size', () => {
    expect(nutritionForServings(chickenBreast, null, 1)).toBeNull();
    expect(nutritionForServings(chickenBreast, 0, 1)).toBeNull();
  });
});

describe('validateFoodData', () => {
  it('passes clean data', () => {
    expect(validateFoodData(chickenBreast)).toEqual([]);
  });

  it('flags missing macros', () => {
    expect(validateFoodData({ ...chickenBreast, proteinPer100g: null })).toContain(
      'missing_macros',
    );
  });

  it('flags macros that exceed the mass they came from', () => {
    const issues = validateFoodData({
      caloriesPer100g: 500,
      proteinPer100g: 50,
      carbsPer100g: 50,
      fatPer100g: 40,
      fiberPer100g: 0,
    });
    expect(issues).toContain('macros_exceed_mass');
  });

  it('allows a rounding-level overshoot without complaining', () => {
    const issues = validateFoodData({
      caloriesPer100g: 400,
      proteinPer100g: 33.4,
      carbsPer100g: 33.4,
      fatPer100g: 33.4,
      fiberPer100g: 0,
    });
    expect(issues).not.toContain('macros_exceed_mass');
  });

  it('flags calories that contradict the macros', () => {
    // 31 P / 0 C / 3.6 F is about 157 kcal, not 600.
    const issues = validateFoodData({ ...chickenBreast, caloriesPer100g: 600 });
    expect(issues).toContain('energy_mismatch');
  });

  it('tolerates the normal gap caused by fibre and polyols', () => {
    // Atwater gives 4/4/9; fibre yields closer to 2 kcal/g, so a high-fibre
    // food legitimately reads a little under its computed energy.
    const issues = validateFoodData({
      caloriesPer100g: 340,
      proteinPer100g: 13,
      carbsPer100g: 60,
      fatPer100g: 6,
      fiberPer100g: 10,
    });
    expect(issues).not.toContain('energy_mismatch');
  });

  it('flags an energy figure no food can reach', () => {
    expect(
      validateFoodData({
        caloriesPer100g: 3100,
        proteinPer100g: null,
        carbsPer100g: null,
        fatPer100g: null,
        fiberPer100g: null,
      }),
    ).toContain('implausible_energy');
  });

  it('reports every applicable issue', () => {
    const issues = validateFoodData({
      caloriesPer100g: 950,
      proteinPer100g: 60,
      carbsPer100g: 60,
      fatPer100g: 60,
      fiberPer100g: null,
    });
    expect(issues).toContain('implausible_energy');
    expect(issues).toContain('macros_exceed_mass');
  });
});
