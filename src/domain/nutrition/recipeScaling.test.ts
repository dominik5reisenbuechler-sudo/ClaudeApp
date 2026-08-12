import { describe, expect, it } from 'vitest';

import {
  roundQuantityForUnit,
  scaleIngredient,
  scaleRecipe,
  totalMinutes,
} from './recipeScaling';
import type { RecipeIngredient, ScalableRecipe } from './recipeScaling';

const ingredient = (over: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
  ingredientId: 'chicken_breast',
  name: 'Chicken breast',
  quantity: 200,
  unit: 'g',
  preparationNote: null,
  isScalable: true,
  isOptional: false,
  ...over,
});

const recipe: ScalableRecipe = {
  servings: 2,
  caloriesPerServing: 520,
  proteinPerServing: 48,
  carbsPerServing: 55,
  fatPerServing: 12,
  fiberPerServing: 4,
  ingredients: [
    ingredient(),
    ingredient({ ingredientId: 'rice', name: 'Rice', quantity: 150 }),
    ingredient({ ingredientId: 'salt', name: 'Salt', quantity: 1, unit: 'tsp', isScalable: false }),
    ingredient({ ingredientId: 'olive_oil', name: 'Olive oil', quantity: 1, unit: 'tbsp', isScalable: false }),
  ],
};

describe('roundQuantityForUnit', () => {
  it('rounds grams to 5 above 50, and to 1 below', () => {
    expect(roundQuantityForUnit(133.33, 'g')).toBe(135);
    expect(roundQuantityForUnit(12.4, 'g')).toBe(12);
  });

  it('never rounds a small mass down to zero', () => {
    expect(roundQuantityForUnit(0.2, 'g')).toBe(1);
  });

  it('rounds count units to halves, since a fifth of an egg is not a thing', () => {
    expect(roundQuantityForUnit(1.3, 'piece')).toBe(1.5);
    expect(roundQuantityForUnit(2.9, 'eggs')).toBe(3);
    expect(roundQuantityForUnit(0.1, 'clove')).toBe(0.5);
  });

  it('rounds spoons to quarters', () => {
    expect(roundQuantityForUnit(0.66, 'tbsp')).toBe(0.75);
    expect(roundQuantityForUnit(1.1, 'tsp')).toBe(1);
  });

  it('rounds kilograms and litres finely enough to stay accurate', () => {
    expect(roundQuantityForUnit(1.234, 'kg')).toBe(1.25);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(roundQuantityForUnit(133.33, ' G ')).toBe(135);
  });
});

describe('scaleIngredient', () => {
  it('scales a scalable ingredient', () => {
    expect(scaleIngredient(ingredient(), 2).quantity).toBe(400);
  });

  it('leaves a fixed ingredient alone', () => {
    // Doubling the servings must not double the pinch of salt.
    const salt = ingredient({ quantity: 1, unit: 'tsp', isScalable: false });
    expect(scaleIngredient(salt, 4).quantity).toBe(1);
  });

  it('does not mutate its input', () => {
    const original = ingredient();
    scaleIngredient(original, 3);
    expect(original.quantity).toBe(200);
  });
});

describe('scaleRecipe', () => {
  it('leaves everything alone at the original serving count', () => {
    const scaled = scaleRecipe(recipe, 2);
    expect(scaled.factor).toBe(1);
    expect(scaled.ingredients[0]?.quantity).toBe(200);
    expect(scaled.total.energyKcal).toBe(1040);
  });

  it('doubles ingredients and totals for double the servings', () => {
    const scaled = scaleRecipe(recipe, 4);
    expect(scaled.factor).toBe(2);
    expect(scaled.ingredients[0]?.quantity).toBe(400);
    expect(scaled.ingredients[1]?.quantity).toBe(300);
    expect(scaled.total.energyKcal).toBe(2080);
    expect(scaled.total.proteinG).toBe(192);
  });

  it('halves for a single serving', () => {
    const scaled = scaleRecipe(recipe, 1);
    expect(scaled.ingredients[0]?.quantity).toBe(100);
    expect(scaled.total.energyKcal).toBe(520);
    expect(scaled.total.proteinG).toBe(48);
  });

  it('handles a fractional serving', () => {
    const scaled = scaleRecipe(recipe, 0.5);
    expect(scaled.ingredients[0]?.quantity).toBe(50);
    expect(scaled.total.energyKcal).toBe(260);
  });

  it('holds fixed ingredients constant at every scale and says that it did', () => {
    const scaled = scaleRecipe(recipe, 6);
    expect(scaled.ingredients[2]?.quantity).toBe(1);
    expect(scaled.ingredients[3]?.quantity).toBe(1);
    expect(scaled.hasFixedIngredients).toBe(true);
  });

  it('keeps per-serving nutrition unchanged, by definition', () => {
    expect(scaleRecipe(recipe, 1).perServing.energyKcal).toBe(520);
    expect(scaleRecipe(recipe, 8).perServing.energyKcal).toBe(520);
  });

  it('derives totals from the exact factor, not the rounded ingredients', () => {
    // Ingredient rounding is a kitchen convenience. If the logged macros were
    // recomputed from rounded amounts, what the user logs would drift from what
    // the recipe says it contains.
    const thirds = scaleRecipe(recipe, 2 / 3);
    expect(thirds.total.energyKcal).toBeCloseTo(346.7, 1);
  });

  it('propagates unknown nutrients as null rather than zero', () => {
    const incomplete = scaleRecipe({ ...recipe, fiberPerServing: null }, 4);
    expect(incomplete.total.fiberG).toBeNull();
    expect(incomplete.perServing.fiberG).toBeNull();
  });

  it('rejects a non-positive target', () => {
    expect(() => scaleRecipe(recipe, 0)).toThrow();
    expect(() => scaleRecipe(recipe, -2)).toThrow();
    expect(() => scaleRecipe(recipe, Number.NaN)).toThrow();
  });

  it('rejects a recipe that claims zero servings', () => {
    expect(() => scaleRecipe({ ...recipe, servings: 0 }, 2)).toThrow();
  });

  it('reports no fixed ingredients when everything scales', () => {
    const allScalable = { ...recipe, ingredients: [ingredient()] };
    expect(scaleRecipe(allScalable, 3).hasFixedIngredients).toBe(false);
  });
});

describe('totalMinutes', () => {
  it('adds prep and cook time', () => {
    expect(totalMinutes({ prepMinutes: 10, cookMinutes: 15 })).toBe(25);
  });
});
