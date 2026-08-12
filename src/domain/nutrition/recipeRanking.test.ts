import { describe, expect, it } from 'vitest';

import {
  calorieFitScore,
  dietCompatibility,
  hasAllergenConflict,
  proteinFitScore,
  rankRecipes,
  timeScore,
} from './recipeRanking';
import type { RankableRecipe, RankingContext } from './recipeRanking';

const recipe = (over: Partial<RankableRecipe> = {}): RankableRecipe => ({
  id: 'chicken_rice_bowl',
  title: 'Chicken Rice Bowl',
  mealType: 'lunch',
  caloriesPerServing: 550,
  proteinPerServing: 45,
  prepMinutes: 10,
  cookMinutes: 20,
  dietaryTags: ['high_protein'],
  allergens: [],
  ingredientNames: ['chicken breast', 'rice', 'broccoli'],
  costBand: 1,
  ...over,
});

const context = (over: Partial<RankingContext> = {}): RankingContext => ({
  remainingKcal: 620,
  remainingProteinG: 55,
  dietType: 'omnivore',
  allergens: [],
  dislikedFoods: [],
  favoriteRecipeIds: [],
  ...over,
});

describe('dietCompatibility', () => {
  it('lets an omnivore eat anything', () => {
    expect(dietCompatibility(recipe(), 'omnivore')).toBe('ok');
  });

  it('excludes untagged recipes for a vegan', () => {
    expect(dietCompatibility(recipe(), 'vegan')).toBe('excluded');
    expect(dietCompatibility(recipe({ dietaryTags: ['vegan'] }), 'vegan')).toBe('ok');
  });

  it('lets a vegetarian eat vegan food, and a pescatarian eat vegetarian food', () => {
    expect(dietCompatibility(recipe({ dietaryTags: ['vegan'] }), 'vegetarian')).toBe('ok');
    expect(dietCompatibility(recipe({ dietaryTags: ['vegetarian'] }), 'pescatarian')).toBe('ok');
    expect(dietCompatibility(recipe({ dietaryTags: ['pescatarian'] }), 'vegetarian')).toBe(
      'excluded',
    );
  });

  it('excludes pork and alcohol for halal, and says everything else is unverifiable', () => {
    // Certification is not something we can confirm from ingredients — claiming
    // a recipe is halal would overstate what we know.
    expect(dietCompatibility(recipe({ dietaryTags: ['contains_pork'] }), 'halal')).toBe('excluded');
    expect(dietCompatibility(recipe(), 'halal')).toBe('unverifiable');
  });

  it('excludes pork and shellfish for kosher', () => {
    expect(dietCompatibility(recipe({ dietaryTags: ['contains_shellfish'] }), 'kosher')).toBe(
      'excluded',
    );
    expect(dietCompatibility(recipe(), 'kosher')).toBe('unverifiable');
  });
});

describe('hasAllergenConflict', () => {
  it('finds a conflicting allergen', () => {
    expect(hasAllergenConflict(recipe({ allergens: ['milk', 'eggs'] }), ['eggs'])).toBe('eggs');
  });

  it('returns null when clear', () => {
    expect(hasAllergenConflict(recipe(), ['peanuts'])).toBeNull();
  });
});

describe('calorieFitScore', () => {
  it('rises with budget use up to the full budget', () => {
    expect(calorieFitScore(300, 600)).toBeCloseTo(0.5, 6);
    expect(calorieFitScore(600, 600)).toBe(1);
  });

  it('falls away sharply past the budget', () => {
    expect(calorieFitScore(660, 600)).toBeLessThan(1);
    expect(calorieFitScore(900, 600)).toBeCloseTo(0.25, 6);
    expect(calorieFitScore(1500, 600)).toBe(0);
  });

  it('is neutral when nothing is left', () => {
    expect(calorieFitScore(500, 0)).toBe(0.5);
    expect(calorieFitScore(500, -100)).toBe(0.5);
  });
});

describe('proteinFitScore', () => {
  it('scores by coverage of what is left', () => {
    expect(proteinFitScore(30, 60)).toBeCloseTo(0.5, 6);
    expect(proteinFitScore(60, 60)).toBe(1);
  });

  it('does not penalise over-delivery', () => {
    // On a hypertrophy plan, a meal with more protein than strictly needed is
    // not a worse meal.
    expect(proteinFitScore(90, 60)).toBe(1);
  });

  it('gives unknown protein a mediocre score rather than zero or full credit', () => {
    const unknown = proteinFitScore(null, 60);
    expect(unknown).toBeGreaterThan(0);
    expect(unknown).toBeLessThan(proteinFitScore(60, 60));
  });

  it('is satisfied when no protein remains', () => {
    expect(proteinFitScore(10, 0)).toBe(1);
  });
});

describe('timeScore', () => {
  it('prefers quicker meals and bottoms out at the ceiling', () => {
    expect(timeScore(0)).toBe(1);
    expect(timeScore(30)).toBeCloseTo(0.5, 6);
    expect(timeScore(90)).toBe(0);
  });
});

describe('rankRecipes', () => {
  it('ranks the better macro fit first', () => {
    const good = recipe({ id: 'good', title: 'Good Fit', caloriesPerServing: 600, proteinPerServing: 55 });
    const poor = recipe({ id: 'poor', title: 'Poor Fit', caloriesPerServing: 250, proteinPerServing: 8 });

    const result = rankRecipes([poor, good], context());
    expect(result.ranked[0]?.recipe.id).toBe('good');
  });

  it('excludes allergen conflicts entirely and says why', () => {
    const withMilk = recipe({ id: 'milky', allergens: ['milk'] });
    const result = rankRecipes([withMilk, recipe()], context({ allergens: ['milk'] }));

    expect(result.ranked.map((r) => r.recipe.id)).not.toContain('milky');
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]?.reason).toBe('allergen');
    expect(result.excluded[0]?.detail).toMatch(/milk/i);
  });

  it('excludes diet violations entirely', () => {
    const result = rankRecipes([recipe()], context({ dietType: 'vegan' }));
    expect(result.ranked).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe('diet');
  });

  it('ranks disliked foods down without hiding them', () => {
    const withOlives = recipe({
      id: 'olives',
      title: 'Olive Bowl',
      ingredientNames: ['olives', 'rice'],
    });
    const plain = recipe({ id: 'plain', title: 'Plain Bowl' });

    const result = rankRecipes([withOlives, plain], context({ dislikedFoods: ['olives'] }));

    // Still present — a dislike is a preference, not an allergy…
    expect(result.ranked.map((r) => r.recipe.id)).toContain('olives');
    // …but ranked below the otherwise-identical recipe, with the reason stated.
    expect(result.ranked[0]?.recipe.id).toBe('plain');
    const olives = result.ranked.find((r) => r.recipe.id === 'olives');
    expect(olives?.reasons.join(' ')).toMatch(/olives/i);
  });

  it('matches dislikes in the title as well as the ingredients', () => {
    const tunaBake = recipe({ id: 'tuna', title: 'Tuna Pasta Bake', ingredientNames: ['pasta'] });
    const result = rankRecipes([tunaBake, recipe({ id: 'other', title: 'Chicken Bowl' })],
      context({ dislikedFoods: ['tuna'] }));
    expect(result.ranked[0]?.recipe.id).toBe('other');
  });

  it('gives favourites a bounded nudge', () => {
    const a = recipe({ id: 'a', title: 'A Bowl' });
    const b = recipe({ id: 'b', title: 'B Bowl' });

    const without = rankRecipes([a, b], context());
    const withFav = rankRecipes([a, b], context({ favoriteRecipeIds: ['b'] }));

    // Identical recipes: the favourite wins the tie.
    expect(without.ranked[0]?.recipe.id).toBe('a'); // alphabetical tie-break
    expect(withFav.ranked[0]?.recipe.id).toBe('b');
  });

  it('does not let a favourite outrank a clearly better fit', () => {
    const great = recipe({ id: 'great', title: 'Great Fit', caloriesPerServing: 600, proteinPerServing: 55 });
    const bad = recipe({ id: 'bad', title: 'Bad Fit', caloriesPerServing: 1400, proteinPerServing: 5 });

    const result = rankRecipes([great, bad], context({ favoriteRecipeIds: ['bad'] }));
    expect(result.ranked[0]?.recipe.id).toBe('great');
  });

  it('explains its reasoning in the user\'s numbers', () => {
    const result = rankRecipes([recipe()], context());
    const reasons = result.ranked[0]?.reasons.join(' ') ?? '';
    expect(reasons).toMatch(/45 g of your remaining 55 g/);
    expect(reasons).toMatch(/620 kcal/);
  });

  it('says when a recipe exceeds the remaining budget', () => {
    const big = recipe({ caloriesPerServing: 800 });
    const result = rankRecipes([big], context({ remainingKcal: 620 }));
    expect(result.ranked[0]?.reasons.join(' ')).toMatch(/180 kcal over/);
  });

  it('flags unverifiable diet compatibility rather than staying silent', () => {
    const result = rankRecipes([recipe()], context({ dietType: 'halal' }));
    expect(result.ranked[0]?.dietCompatibility).toBe('unverifiable');
    expect(result.ranked[0]?.reasons.join(' ')).toMatch(/cannot verify/i);
  });

  it('breaks score ties deterministically by title', () => {
    const b = recipe({ id: 'b', title: 'Bravo Bowl' });
    const a = recipe({ id: 'a', title: 'Alpha Bowl' });
    const result = rankRecipes([b, a], context());
    expect(result.ranked.map((r) => r.recipe.title)).toEqual(['Alpha Bowl', 'Bravo Bowl']);
  });

  it('handles an empty catalogue', () => {
    expect(rankRecipes([], context())).toEqual({ ranked: [], excluded: [] });
  });
});
