/**
 * Automatic weekly meal-plan generation.
 *
 * Deliberately greedy and deterministic rather than an optimiser. Two reasons:
 *
 *   1. The same inputs must always produce the same week. Nothing here calls
 *      `Math.random()` (ADR-004), so a plan can be regenerated, explained and
 *      tested.
 *
 *   2. Exact macro targets are the wrong goal. A plan that hits 2,650 kcal to
 *      the calorie by prescribing 137 g of rice is worse than one landing
 *      within a few percent using amounts a person will actually cook
 *      (CLAUDE.md §21).
 *
 * The modes change what "good" means, not how the search works.
 */

import { dietCompatibility, hasAllergenConflict } from './recipeRanking';
import type { RankableRecipe } from './recipeRanking';
import { totalMinutes } from './recipeScaling';
import { addDays } from '@/utils/date';
import { clamp } from '@/utils/number';
import type { DietType, IsoDate, MealType, PlanMode } from '@/types/domain';

export const PLAN_MODE_LABELS: Record<PlanMode, string> = {
  balanced: 'Balanced',
  maximum_variety: 'Maximum variety',
  meal_prep: 'Meal prep',
  budget: 'Budget',
  quick_easy: 'Quick & easy',
  high_protein: 'High protein',
  cut_friendly: 'Cut friendly',
  bulk: 'Bulk',
};

export const PLAN_MODE_DESCRIPTIONS: Record<PlanMode, string> = {
  balanced: 'A sensible spread across the week, with reasonable variety.',
  maximum_variety: 'Rarely repeats a meal. More shopping, less monotony.',
  meal_prep: 'Deliberately repeats meals and reuses ingredients so you can cook in batches.',
  budget: 'Favours cheaper ingredients and repeats staples to cut waste.',
  quick_easy: 'Nothing that takes long. Best for weeks with no time to cook.',
  high_protein: 'Pushes protein as high as the catalogue allows.',
  cut_friendly: 'Higher volume, lower calorie density — easier to stick to in a deficit.',
  bulk: 'Calorie-dense meals that are easier to eat when the target is high.',
};

export interface PlannableRecipe extends RankableRecipe {
  mealPrepRating: number;
  ingredientIds: readonly string[];
}

export interface PlanGenerationInput {
  /** Monday of the week being planned. */
  weekStart: IsoDate;
  targets: { energyKcal: number; proteinG: number };
  mode: PlanMode;
  /** Slots per day. Clamped to 3 or 4. */
  mealsPerDay: number;
  recipes: readonly PlannableRecipe[];
  dietType: DietType;
  allergens: readonly string[];
  dislikedFoods: readonly string[];
  favoriteRecipeIds: readonly string[];
  /** When set, recipes taking longer are still allowed but ranked well down. */
  maxCookMinutes?: number;
}

export interface PlannedMeal {
  dayIndex: number;
  date: IsoDate;
  mealType: MealType;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  energyKcal: number;
  proteinG: number | null;
}

export interface PlannedDay {
  dayIndex: number;
  date: IsoDate;
  energyKcal: number;
  proteinG: number;
  meals: PlannedMeal[];
}

export interface GeneratedPlan {
  mode: PlanMode;
  days: PlannedDay[];
  meals: PlannedMeal[];
  uniqueRecipeCount: number;
  uniqueIngredientCount: number;
  /** Honest notes about where the plan falls short. Never silently swallowed. */
  warnings: string[];
}

/** Share of the daily energy budget each slot is aimed at. */
const SLOT_SHARES: Record<3 | 4, { mealType: MealType; share: number }[]> = {
  3: [
    { mealType: 'breakfast', share: 0.3 },
    { mealType: 'lunch', share: 0.35 },
    { mealType: 'dinner', share: 0.35 },
  ],
  4: [
    { mealType: 'breakfast', share: 0.25 },
    { mealType: 'lunch', share: 0.3 },
    { mealType: 'snack', share: 0.13 },
    { mealType: 'dinner', share: 0.32 },
  ],
};

/** Portion sizes the generator is allowed to prescribe. */
const SERVING_OPTIONS = [0.5, 1, 1.5, 2] as const;

interface ModeConfig {
  calorieWeight: number;
  proteinWeight: number;
  timeWeight: number;
  costWeight: number;
  /** Score subtracted per previous use of the recipe this week. */
  repeatPenalty: number;
  /** Score added per previous use, up to `repeatBonusCap` uses. */
  repeatBonus: number;
  repeatBonusCap: number;
  /** Weight on overlap with ingredients already in the week. */
  ingredientReuseWeight: number;
  mealPrepWeight: number;
  tagBonuses: Readonly<Record<string, number>>;
}

const BASE: ModeConfig = {
  calorieWeight: 0.5,
  proteinWeight: 0.25,
  timeWeight: 0.1,
  costWeight: 0.05,
  repeatPenalty: 0.3,
  repeatBonus: 0,
  repeatBonusCap: 0,
  ingredientReuseWeight: 0,
  mealPrepWeight: 0,
  tagBonuses: {},
};

const MODE_CONFIG: Record<PlanMode, ModeConfig> = {
  balanced: BASE,

  maximum_variety: { ...BASE, repeatPenalty: 1.2 },

  // Repetition is the point: cook chicken once, eat it three times.
  meal_prep: {
    ...BASE,
    repeatPenalty: 0,
    repeatBonus: 0.28,
    repeatBonusCap: 3,
    ingredientReuseWeight: 0.35,
    mealPrepWeight: 0.2,
    tagBonuses: { meal_prep: 0.15 },
  },

  budget: {
    ...BASE,
    costWeight: 0.35,
    repeatPenalty: 0.1,
    ingredientReuseWeight: 0.2,
    tagBonuses: { budget: 0.2 },
  },

  quick_easy: { ...BASE, timeWeight: 0.45, tagBonuses: { under_15_min: 0.2 } },

  high_protein: {
    ...BASE,
    proteinWeight: 0.55,
    calorieWeight: 0.35,
    tagBonuses: { high_protein: 0.1, protein_50: 0.15 },
  },

  cut_friendly: {
    ...BASE,
    proteinWeight: 0.4,
    tagBonuses: { cut_friendly: 0.2, low_calorie: 0.15 },
  },

  bulk: { ...BASE, tagBonuses: { bulk_friendly: 0.2 } },
};

/** How close a meal lands to the slot's calorie target. 1 = exact. */
function slotFitScore(energyKcal: number, targetKcal: number): number {
  if (targetKcal <= 0) return 0;
  return clamp(1 - Math.abs(energyKcal - targetKcal) / targetKcal, 0, 1);
}

/** Protein per 100 kcal, normalised against a generous 12 g/100 kcal ceiling. */
function proteinDensityScore(recipe: PlannableRecipe): number {
  if (recipe.proteinPerServing === null || recipe.caloriesPerServing <= 0) return 0.3;
  const density = (recipe.proteinPerServing / recipe.caloriesPerServing) * 100;
  return clamp(density / 12, 0, 1);
}

function costScore(costBand: number): number {
  // Band 1 (cheap) scores 1, band 3 scores 0.
  return clamp((3 - costBand) / 2, 0, 1);
}

function overlapScore(
  recipe: PlannableRecipe,
  usedIngredients: ReadonlySet<string>,
): number {
  if (recipe.ingredientIds.length === 0 || usedIngredients.size === 0) return 0;
  const shared = recipe.ingredientIds.filter((id) => usedIngredients.has(id)).length;
  return shared / recipe.ingredientIds.length;
}

export function matchesDisliked(
  recipe: Pick<PlannableRecipe, 'title' | 'ingredientNames'>,
  disliked: readonly string[],
): boolean {
  return disliked.some((term) => {
    const needle = term.trim().toLowerCase();
    if (needle.length === 0) return false;
    return (
      recipe.title.toLowerCase().includes(needle) ||
      recipe.ingredientNames.some((name) => name.toLowerCase().includes(needle))
    );
  });
}

/** Candidates that are safe and permitted for this user. Ordered for determinism. */
export function eligibleRecipes(input: PlanGenerationInput): PlannableRecipe[] {
  return input.recipes
    .filter((recipe) => hasAllergenConflict(recipe, input.allergens) === null)
    .filter((recipe) => dietCompatibility(recipe, input.dietType) !== 'excluded')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

interface SlotChoice {
  recipe: PlannableRecipe;
  servings: number;
  energyKcal: number;
}

function chooseForSlot(
  candidates: readonly PlannableRecipe[],
  slotTargetKcal: number,
  config: ModeConfig,
  usageCounts: ReadonlyMap<string, number>,
  usedIngredients: ReadonlySet<string>,
  input: PlanGenerationInput,
  mealType: MealType,
): SlotChoice | null {
  let best: SlotChoice | null = null;
  let bestScore = -Infinity;

  for (const recipe of candidates) {
    // Prefer recipes authored for this slot, but do not refuse a good fit.
    const slotMatchBonus = recipe.mealType === mealType ? 0.25 : 0;

    for (const servings of SERVING_OPTIONS) {
      const energyKcal = recipe.caloriesPerServing * servings;

      let score =
        config.calorieWeight * slotFitScore(energyKcal, slotTargetKcal) +
        config.proteinWeight * proteinDensityScore(recipe) +
        config.timeWeight * clamp(1 - totalMinutes(recipe) / 60, 0, 1) +
        config.costWeight * costScore(recipe.costBand) +
        config.mealPrepWeight * (recipe.mealPrepRating / 3) +
        config.ingredientReuseWeight * overlapScore(recipe, usedIngredients) +
        slotMatchBonus;

      for (const [tag, bonus] of Object.entries(config.tagBonuses)) {
        if (recipe.dietaryTags.includes(tag)) score += bonus;
      }

      const uses = usageCounts.get(recipe.id) ?? 0;
      score -= config.repeatPenalty * uses;
      score += config.repeatBonus * Math.min(uses, config.repeatBonusCap);

      if (input.favoriteRecipeIds.includes(recipe.id)) score += 0.08;
      if (input.maxCookMinutes !== undefined && totalMinutes(recipe) > input.maxCookMinutes) {
        score -= 0.4;
      }
      // A half portion of something is rarely what a person wants; only pick it
      // when it genuinely fits better.
      if (servings === 0.5) score -= 0.05;

      // Strictly-greater keeps the first candidate on a tie, and candidates
      // arrive sorted by id — so the result is deterministic.
      if (score > bestScore) {
        bestScore = score;
        best = { recipe, servings, energyKcal };
      }
    }
  }

  return best;
}

export function generateMealPlan(input: PlanGenerationInput): GeneratedPlan {
  const config = MODE_CONFIG[input.mode];
  const slots = SLOT_SHARES[input.mealsPerDay >= 4 ? 4 : 3];
  const eligible = eligibleRecipes(input);

  const warnings: string[] = [];

  /*
   * Disliked foods are EXCLUDED here, where they are only ranked down when
   * browsing (see recipeRanking). The difference is who is choosing: a user
   * scrolling a list can skip past the olives, but a generated week puts them
   * on the plan unasked. An explicit "I would rather not eat this" should be
   * honoured when anything else will do — and when nothing else will, the plan
   * says so rather than quietly overriding the preference.
   */
  const preferred = eligible.filter((recipe) => !matchesDisliked(recipe, input.dislikedFoods));
  const candidates = preferred.length > 0 ? preferred : eligible;

  if (preferred.length === 0 && eligible.length > 0) {
    warnings.push(
      'Every recipe that fits your allergies and diet also contains something you said you would rather avoid, so this plan includes them. Adding your own recipes would give us more to work with.',
    );
  }

  if (candidates.length === 0) {
    return {
      mode: input.mode,
      days: [],
      meals: [],
      uniqueRecipeCount: 0,
      uniqueIngredientCount: 0,
      warnings: [
        'No recipes match your allergies and diet, so we could not build a plan. Adding your own recipes will fix this.',
      ],
    };
  }

  if (candidates.length < slots.length * 2 && input.mode === 'maximum_variety') {
    warnings.push(
      `Only ${candidates.length} recipes fit your preferences, so this week will repeat meals despite the variety setting.`,
    );
  }

  const usageCounts = new Map<string, number>();
  const usedIngredients = new Set<string>();
  const meals: PlannedMeal[] = [];
  const days: PlannedDay[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = addDays(input.weekStart, dayIndex);
    const dayMeals: PlannedMeal[] = [];

    for (const slot of slots) {
      const slotTargetKcal = input.targets.energyKcal * slot.share;
      const choice = chooseForSlot(
        candidates,
        slotTargetKcal,
        config,
        usageCounts,
        usedIngredients,
        input,
        slot.mealType,
      );
      if (!choice) continue;

      usageCounts.set(choice.recipe.id, (usageCounts.get(choice.recipe.id) ?? 0) + 1);
      for (const ingredientId of choice.recipe.ingredientIds) usedIngredients.add(ingredientId);

      const meal: PlannedMeal = {
        dayIndex,
        date,
        mealType: slot.mealType,
        recipeId: choice.recipe.id,
        recipeTitle: choice.recipe.title,
        servings: choice.servings,
        energyKcal: round1(choice.energyKcal),
        proteinG:
          choice.recipe.proteinPerServing === null
            ? null
            : round1(choice.recipe.proteinPerServing * choice.servings),
      };

      dayMeals.push(meal);
      meals.push(meal);
    }

    const energyKcal = round1(dayMeals.reduce((sum, meal) => sum + meal.energyKcal, 0));
    const proteinG = round1(dayMeals.reduce((sum, meal) => sum + (meal.proteinG ?? 0), 0));

    days.push({ dayIndex, date, energyKcal, proteinG, meals: dayMeals });
  }

  // Report material drift rather than hiding it behind a plausible-looking plan.
  const energyDrift = days.map((day) =>
    input.targets.energyKcal > 0
      ? Math.abs(day.energyKcal - input.targets.energyKcal) / input.targets.energyKcal
      : 0,
  );
  const driftingDays = energyDrift.filter((drift) => drift > 0.12).length;
  if (driftingDays > 0) {
    warnings.push(
      `${driftingDays} of 7 days land more than 12% away from your calorie target. Adjust servings on those days, or add more recipes to choose from.`,
    );
  }

  const averageProtein =
    days.length > 0 ? days.reduce((sum, day) => sum + day.proteinG, 0) / days.length : 0;
  if (input.targets.proteinG > 0 && averageProtein < input.targets.proteinG * 0.85) {
    warnings.push(
      `This plan averages about ${Math.round(averageProtein)} g protein against your ${input.targets.proteinG} g target. A protein shake or a higher-protein snack would close the gap.`,
    );
  }

  return {
    mode: input.mode,
    days,
    meals,
    uniqueRecipeCount: usageCounts.size,
    uniqueIngredientCount: usedIngredients.size,
    warnings,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
