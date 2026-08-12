/**
 * Ranking recipes against what the user has left to eat.
 *
 * The product question is "I have 620 kcal and 55 g protein left — what should
 * I eat?", and the answer must be practical rather than optimal. A meal that
 * fits the macros to two decimal places but that the user dislikes, cannot eat,
 * or has no time to cook is a worse answer than a close-enough one they will
 * actually make (CLAUDE.md §18).
 *
 * Two things are hard exclusions, and only two: allergens and diet. Everything
 * else moves the score.
 */

import { totalMinutes } from './recipeScaling';
import type { DietType, MealType } from '@/types/domain';

export interface RankableRecipe {
  id: string;
  title: string;
  mealType: MealType;
  caloriesPerServing: number;
  proteinPerServing: number | null;
  prepMinutes: number;
  cookMinutes: number;
  dietaryTags: readonly string[];
  allergens: readonly string[];
  /** Lower-cased ingredient names, for matching against disliked foods. */
  ingredientNames: readonly string[];
  costBand: number;
}

export interface RankingContext {
  remainingKcal: number;
  remainingProteinG: number;
  dietType: DietType;
  allergens: readonly string[];
  dislikedFoods: readonly string[];
  favoriteRecipeIds: readonly string[];
}

/**
 * `unverifiable` is deliberate. Halal and kosher status depends on
 * certification and preparation we have no data for, so claiming a recipe is
 * compliant would be a lie. We exclude what is clearly disqualifying and tell
 * the user we cannot confirm the rest.
 */
export type DietCompatibility = 'ok' | 'excluded' | 'unverifiable';

export interface ScoredRecipe {
  recipe: RankableRecipe;
  /** 0–1. Only meaningful relative to other recipes in the same ranking. */
  score: number;
  /** Why this recipe was ranked where it was, in the user's terms. */
  reasons: string[];
  dietCompatibility: DietCompatibility;
}

export interface ExcludedRecipe {
  recipe: RankableRecipe;
  reason: 'allergen' | 'diet';
  detail: string;
}

export interface RankingResult {
  ranked: ScoredRecipe[];
  /** Kept separate so the UI can say "3 hidden because of your allergies". */
  excluded: ExcludedRecipe[];
}

const WEIGHT_PROTEIN = 0.5;
const WEIGHT_CALORIES = 0.35;
const WEIGHT_TIME = 0.15;

const FAVORITE_BONUS = 0.05;
/** Disliked ingredients rank a recipe down; they never hide it (CLAUDE.md §18). */
const DISLIKE_MULTIPLIER = 0.35;

/** Unknown protein is mildly penalised: we cannot confirm the recipe helps. */
const UNKNOWN_PROTEIN_SCORE = 0.4;

/** Above this, extra cooking time stops mattering — it is already "a project". */
const TIME_CEILING_MINUTES = 60;

export function dietCompatibility(
  recipe: Pick<RankableRecipe, 'dietaryTags'>,
  dietType: DietType,
): DietCompatibility {
  const tags = new Set(recipe.dietaryTags);

  switch (dietType) {
    case 'vegan':
      return tags.has('vegan') ? 'ok' : 'excluded';
    case 'vegetarian':
      return tags.has('vegan') || tags.has('vegetarian') ? 'ok' : 'excluded';
    case 'pescatarian':
      return tags.has('vegan') || tags.has('vegetarian') || tags.has('pescatarian')
        ? 'ok'
        : 'excluded';
    case 'halal':
      if (tags.has('contains_pork') || tags.has('contains_alcohol')) return 'excluded';
      return 'unverifiable';
    case 'kosher':
      if (tags.has('contains_pork') || tags.has('contains_shellfish')) return 'excluded';
      return 'unverifiable';
    case 'omnivore':
      return 'ok';
  }
}

export function hasAllergenConflict(
  recipe: Pick<RankableRecipe, 'allergens'>,
  userAllergens: readonly string[],
): string | null {
  for (const allergen of userAllergens) {
    if (recipe.allergens.includes(allergen)) return allergen;
  }
  return null;
}

/**
 * A meal that uses more of the remaining budget scores higher, up to the point
 * where it exceeds it — after which the score falls away sharply. Being 50%
 * over the remaining calories is a bad suggestion; being 10% over is fine.
 */
export function calorieFitScore(calories: number, remainingKcal: number): number {
  if (remainingKcal <= 0) return 0.5;
  const ratio = calories / remainingKcal;
  if (ratio <= 1) return ratio;
  return Math.max(0, 1 - (ratio - 1) * 1.5);
}

/**
 * Protein is scored on coverage of what is left, and over-delivering is not
 * penalised: on a hypertrophy plan, more protein in a meal is rarely a problem.
 */
export function proteinFitScore(
  protein: number | null,
  remainingProteinG: number,
): number {
  if (protein === null) return UNKNOWN_PROTEIN_SCORE;
  if (remainingProteinG <= 0) return 1;
  return Math.min(1, protein / remainingProteinG);
}

export function timeScore(minutes: number): number {
  return Math.max(0, 1 - minutes / TIME_CEILING_MINUTES);
}

function matchesDisliked(
  recipe: RankableRecipe,
  dislikedFoods: readonly string[],
): string | null {
  for (const disliked of dislikedFoods) {
    const needle = disliked.trim().toLowerCase();
    if (needle.length === 0) continue;
    if (recipe.title.toLowerCase().includes(needle)) return disliked;
    if (recipe.ingredientNames.some((name) => name.toLowerCase().includes(needle))) {
      return disliked;
    }
  }
  return null;
}

export function rankRecipes(
  recipes: readonly RankableRecipe[],
  context: RankingContext,
): RankingResult {
  const ranked: ScoredRecipe[] = [];
  const excluded: ExcludedRecipe[] = [];

  for (const recipe of recipes) {
    const allergen = hasAllergenConflict(recipe, context.allergens);
    if (allergen) {
      excluded.push({
        recipe,
        reason: 'allergen',
        detail: `Contains ${allergen.replace(/_/g, ' ')}`,
      });
      continue;
    }

    const compatibility = dietCompatibility(recipe, context.dietType);
    if (compatibility === 'excluded') {
      excluded.push({
        recipe,
        reason: 'diet',
        detail: `Does not fit a ${context.dietType.replace(/_/g, ' ')} diet`,
      });
      continue;
    }

    const minutes = totalMinutes(recipe);
    const calorieScore = calorieFitScore(recipe.caloriesPerServing, context.remainingKcal);
    const proteinScore = proteinFitScore(recipe.proteinPerServing, context.remainingProteinG);

    let score =
      WEIGHT_PROTEIN * proteinScore +
      WEIGHT_CALORIES * calorieScore +
      WEIGHT_TIME * timeScore(minutes);

    const reasons: string[] = [];

    if (recipe.proteinPerServing !== null && context.remainingProteinG > 0) {
      const covered = Math.min(recipe.proteinPerServing, context.remainingProteinG);
      reasons.push(
        `Covers ${Math.round(covered)} g of your remaining ${Math.round(context.remainingProteinG)} g protein`,
      );
    } else if (recipe.proteinPerServing === null) {
      reasons.push('Protein content unknown');
    }

    if (context.remainingKcal > 0) {
      if (recipe.caloriesPerServing <= context.remainingKcal) {
        reasons.push(`Fits inside your remaining ${Math.round(context.remainingKcal)} kcal`);
      } else {
        reasons.push(
          `${Math.round(recipe.caloriesPerServing - context.remainingKcal)} kcal over what is left`,
        );
      }
    }

    if (minutes <= 15) reasons.push(`Ready in ${minutes} minutes`);

    if (context.favoriteRecipeIds.includes(recipe.id)) {
      score = Math.min(1, score + FAVORITE_BONUS);
      reasons.push('One of your favourites');
    }

    const disliked = matchesDisliked(recipe, context.dislikedFoods);
    if (disliked) {
      score *= DISLIKE_MULTIPLIER;
      reasons.push(`Contains ${disliked}, which you said you would rather avoid`);
    }

    if (compatibility === 'unverifiable') {
      reasons.push(`We cannot verify this is ${context.dietType} — please check the ingredients`);
    }

    ranked.push({ recipe, score: round3(score), reasons, dietCompatibility: compatibility });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, predictable tie-break rather than whatever order the rows arrived
    // in — a list that reshuffles between renders feels broken.
    return a.recipe.title.localeCompare(b.recipe.title);
  });

  return { ranked, excluded };
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export const DIETARY_TAG_LABELS: Record<string, string> = {
  high_protein: 'High protein',
  protein_50: '50 g+ protein',
  cut_friendly: 'Cut friendly',
  bulk_friendly: 'Bulk friendly',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
  budget: 'Budget',
  under_15_min: 'Under 15 minutes',
  meal_prep: 'Meal prep',
  low_calorie: 'Low calorie',
  contains_pork: 'Contains pork',
  contains_alcohol: 'Contains alcohol',
  contains_shellfish: 'Contains shellfish',
};
