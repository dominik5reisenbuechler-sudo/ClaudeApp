import { describe, expect, it } from 'vitest';

import { eligibleRecipes, generateMealPlan } from './mealPlanGeneration';
import type { PlanGenerationInput, PlannableRecipe } from './mealPlanGeneration';
import { PLAN_MODES } from '@/types/domain';

const recipe = (over: Partial<PlannableRecipe> = {}): PlannableRecipe => ({
  id: 'chicken_rice',
  title: 'Chicken Rice Bowl',
  mealType: 'lunch',
  caloriesPerServing: 560,
  proteinPerServing: 49,
  prepMinutes: 10,
  cookMinutes: 25,
  dietaryTags: ['high_protein'],
  allergens: [],
  ingredientNames: ['chicken breast', 'rice'],
  costBand: 1,
  mealPrepRating: 3,
  ingredientIds: ['chicken', 'rice'],
  ...over,
});

/** A catalogue broad enough that the generator has real choices to make. */
const catalogue: PlannableRecipe[] = [
  recipe({ id: 'pancakes', title: 'Protein Pancakes', mealType: 'breakfast', caloriesPerServing: 480, proteinPerServing: 40, ingredientIds: ['oats', 'whey'], dietaryTags: ['high_protein', 'vegetarian'] }),
  recipe({ id: 'skyr_bowl', title: 'Skyr Bowl', mealType: 'breakfast', caloriesPerServing: 330, proteinPerServing: 34, prepMinutes: 5, cookMinutes: 0, ingredientIds: ['skyr', 'berries'], dietaryTags: ['high_protein', 'vegetarian', 'under_15_min', 'cut_friendly'] }),
  recipe({ id: 'chicken_rice', title: 'Chicken Rice Bowl', mealType: 'lunch' }),
  recipe({ id: 'burrito_bowl', title: 'Beef Burrito Bowl', mealType: 'lunch', caloriesPerServing: 590, proteinPerServing: 44, costBand: 2, ingredientIds: ['beef', 'rice', 'beans'] }),
  recipe({ id: 'salmon', title: 'Salmon & Potatoes', mealType: 'dinner', caloriesPerServing: 570, proteinPerServing: 39, costBand: 3, allergens: ['fish'], ingredientIds: ['salmon', 'potatoes'], dietaryTags: ['pescatarian'] }),
  recipe({ id: 'protein_pasta', title: 'Creamy Protein Pasta', mealType: 'dinner', caloriesPerServing: 610, proteinPerServing: 52, allergens: ['milk', 'wheat'], ingredientIds: ['pasta', 'chicken', 'quark'], dietaryTags: ['high_protein', 'protein_50'] }),
  recipe({ id: 'tofu_stir_fry', title: 'Tofu Stir-Fry', mealType: 'dinner', caloriesPerServing: 480, proteinPerServing: 28, ingredientIds: ['tofu', 'rice'], dietaryTags: ['vegan', 'vegetarian', 'cut_friendly'] }),
  recipe({ id: 'shake', title: 'Protein Shake', mealType: 'snack', caloriesPerServing: 320, proteinPerServing: 33, prepMinutes: 5, cookMinutes: 0, allergens: ['milk'], ingredientIds: ['whey', 'milk'], dietaryTags: ['high_protein', 'under_15_min', 'vegetarian'] }),
  recipe({ id: 'pudding', title: 'Chocolate Protein Pudding', mealType: 'snack', caloriesPerServing: 250, proteinPerServing: 32, prepMinutes: 5, cookMinutes: 0, allergens: ['milk'], ingredientIds: ['quark', 'cocoa'], dietaryTags: ['high_protein', 'cut_friendly', 'low_calorie', 'vegetarian'] }),
];

const input = (over: Partial<PlanGenerationInput> = {}): PlanGenerationInput => ({
  weekStart: '2025-06-16',
  targets: { energyKcal: 2650, proteinG: 175 },
  mode: 'balanced',
  mealsPerDay: 4,
  recipes: catalogue,
  dietType: 'omnivore',
  allergens: [],
  dislikedFoods: [],
  favoriteRecipeIds: [],
  ...over,
});

describe('eligibleRecipes', () => {
  it('drops allergen conflicts and diet violations', () => {
    const ids = eligibleRecipes(input({ allergens: ['milk'], dietType: 'vegan' })).map((r) => r.id);
    expect(ids).toEqual(['tofu_stir_fry']);
  });

  it('returns a stable order regardless of input order', () => {
    const forward = eligibleRecipes(input()).map((r) => r.id);
    const reversed = eligibleRecipes(input({ recipes: [...catalogue].reverse() })).map((r) => r.id);
    expect(forward).toEqual(reversed);
  });
});

describe('generateMealPlan', () => {
  it('fills seven days with the requested number of slots', () => {
    const plan = generateMealPlan(input());
    expect(plan.days).toHaveLength(7);
    expect(plan.meals).toHaveLength(28);
    for (const day of plan.days) expect(day.meals).toHaveLength(4);
  });

  it('drops to three slots when the user eats three meals a day', () => {
    const plan = generateMealPlan(input({ mealsPerDay: 3 }));
    expect(plan.meals).toHaveLength(21);
    expect(plan.days[0]?.meals.map((m) => m.mealType)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('dates each day from the week start', () => {
    const plan = generateMealPlan(input());
    expect(plan.days[0]?.date).toBe('2025-06-16');
    expect(plan.days[6]?.date).toBe('2025-06-22');
  });

  it('is deterministic — same inputs, same plan', () => {
    expect(generateMealPlan(input())).toEqual(generateMealPlan(input()));
  });

  it('lands each day near the calorie target', () => {
    const plan = generateMealPlan(input());
    for (const day of plan.days) {
      // Practical, not precise: within a quarter of the target is a usable day.
      expect(Math.abs(day.energyKcal - 2650) / 2650).toBeLessThan(0.25);
    }
  });

  it('never plans a recipe the user is allergic to', () => {
    const plan = generateMealPlan(input({ allergens: ['milk', 'fish'] }));
    const planned = new Set(plan.meals.map((meal) => meal.recipeId));
    expect(planned.has('protein_pasta')).toBe(false);
    expect(planned.has('salmon')).toBe(false);
    expect(planned.has('shake')).toBe(false);
  });

  it('never plans a recipe outside the diet', () => {
    const plan = generateMealPlan(input({ dietType: 'vegan' }));
    for (const meal of plan.meals) expect(meal.recipeId).toBe('tofu_stir_fry');
  });

  it('reports honestly when nothing can be planned', () => {
    const plan = generateMealPlan(input({ recipes: [] }));
    expect(plan.meals).toEqual([]);
    expect(plan.warnings[0]).toMatch(/could not build a plan/i);
  });

  it('warns rather than silently producing a low-protein week', () => {
    const plan = generateMealPlan(
      input({ recipes: [recipe({ id: 'low', proteinPerServing: 5 })], targets: { energyKcal: 2650, proteinG: 175 } }),
    );
    expect(plan.warnings.join(' ')).toMatch(/protein/i);
  });

  it('keeps disliked foods out of a generated plan when alternatives exist', () => {
    // Browsing ranks dislikes down; generating excludes them. The app is
    // choosing here, unasked, so an explicit preference gets honoured.
    const plan = generateMealPlan(input({ dislikedFoods: ['tofu'] }));
    expect(plan.meals.some((meal) => meal.recipeId === 'tofu_stir_fry')).toBe(false);
    expect(plan.warnings.join(' ')).not.toMatch(/rather avoid/i);
  });

  it('uses a disliked food only when nothing else fits, and says so', () => {
    const plan = generateMealPlan(
      input({ recipes: [recipe({ id: 'only_tofu', ingredientNames: ['tofu'] })], dislikedFoods: ['tofu'] }),
    );
    expect(plan.meals.length).toBeGreaterThan(0);
    expect(plan.warnings.join(' ')).toMatch(/rather avoid/i);
  });

  it('records the servings it prescribed and the macros that follow', () => {
    const plan = generateMealPlan(input());
    const meal = plan.meals[0];
    expect(meal).toBeDefined();
    expect(meal?.servings).toBeGreaterThan(0);
    expect(meal?.energyKcal).toBeGreaterThan(0);
  });

  it('produces a plan for every mode', () => {
    for (const mode of PLAN_MODES) {
      const plan = generateMealPlan(input({ mode }));
      expect(plan.meals.length, `mode ${mode}`).toBe(28);
      expect(plan.mode).toBe(mode);
    }
  });
});

describe('generateMealPlan — modes differ meaningfully', () => {
  it('meal prep repeats meals; maximum variety does not', () => {
    const prep = generateMealPlan(input({ mode: 'meal_prep' }));
    const variety = generateMealPlan(input({ mode: 'maximum_variety' }));

    expect(prep.uniqueRecipeCount).toBeLessThan(variety.uniqueRecipeCount);
  });

  it('meal prep reuses ingredients across the week', () => {
    const prep = generateMealPlan(input({ mode: 'meal_prep' }));
    const variety = generateMealPlan(input({ mode: 'maximum_variety' }));

    // Fewer distinct ingredients is the whole point: buy chicken once, use it
    // three times.
    expect(prep.uniqueIngredientCount).toBeLessThanOrEqual(variety.uniqueIngredientCount);
  });

  it('budget mode favours cheaper recipes', () => {
    const budget = generateMealPlan(input({ mode: 'budget' }));
    const balanced = generateMealPlan(input({ mode: 'balanced' }));

    const averageCost = (plan: typeof budget) => {
      const byId = new Map(catalogue.map((r) => [r.id, r]));
      const bands = plan.meals.map((meal) => byId.get(meal.recipeId)?.costBand ?? 2);
      return bands.reduce((sum, band) => sum + band, 0) / bands.length;
    };

    expect(averageCost(budget)).toBeLessThanOrEqual(averageCost(balanced));
  });

  it('quick & easy favours faster recipes', () => {
    const quick = generateMealPlan(input({ mode: 'quick_easy' }));
    const balanced = generateMealPlan(input({ mode: 'balanced' }));

    const averageMinutes = (plan: typeof quick) => {
      const byId = new Map(catalogue.map((r) => [r.id, r]));
      const minutes = plan.meals.map((meal) => {
        const found = byId.get(meal.recipeId);
        return found ? found.prepMinutes + found.cookMinutes : 0;
      });
      return minutes.reduce((sum, value) => sum + value, 0) / minutes.length;
    };

    expect(averageMinutes(quick)).toBeLessThan(averageMinutes(balanced));
  });

  it('high protein delivers more protein than balanced', () => {
    const high = generateMealPlan(input({ mode: 'high_protein' }));
    const balanced = generateMealPlan(input({ mode: 'balanced' }));

    const averageProtein = (plan: typeof high) =>
      plan.days.reduce((sum, day) => sum + day.proteinG, 0) / plan.days.length;

    expect(averageProtein(high)).toBeGreaterThanOrEqual(averageProtein(balanced));
  });
});
