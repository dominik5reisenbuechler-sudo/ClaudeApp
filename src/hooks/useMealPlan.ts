import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { generateMealPlan } from '@/domain/nutrition/mealPlanGeneration';
import type { GeneratedPlan, PlannableRecipe } from '@/domain/nutrition/mealPlanGeneration';
import { buildShoppingList } from '@/domain/nutrition/shoppingList';
import {
  addPlanEntry,
  copyDay,
  copyWeek,
  ensureMealPlan,
  fetchMealPlan,
  removePlanEntry,
  replacePlanEntries,
  saveGeneratedPlan,
  updatePlanEntryServings,
} from '@/services/mealPlanService';
import type { FullMealPlan } from '@/services/mealPlanService';
import {
  fetchPantry,
  fetchPlannedIngredients,
  fetchShoppingListForPlan,
  saveShoppingList,
  setShoppingItemChecked,
} from '@/services/shoppingListService';
import { toRankableRecipe } from '@/services/recipeService';
import { useRecipeCatalog, useRecipeIngredientNames, useFavoriteRecipeIds } from './useRecipes';
import { usePreferences, useActiveTarget } from './useProfile';
import { getSupabase } from '@/lib/supabase';
import type { DietType, IsoDate, MealType, PlanMode } from '@/types/domain';
import { startOfIsoWeek, todayIsoDate } from '@/utils/date';

/** The Monday of the week containing `date`. Plans are always Monday-anchored. */
export function weekStartFor(date: IsoDate = todayIsoDate()): IsoDate {
  return startOfIsoWeek(date);
}

const PLAN_KEY = 'meal-plan';
const SHOPPING_KEY = 'shopping-list';

export function useMealPlan(weekStart: IsoDate) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [PLAN_KEY, userId ?? 'anonymous', weekStart],
    queryFn: () => fetchMealPlan(userId as string, weekStart),
    enabled: Boolean(userId),
  });
}

export function useEnsureMealPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (weekStart: IsoDate) => ensureMealPlan(user?.id as string, weekStart),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });
}

/** Ingredient ids per recipe — the generator needs them to score reuse. */
function useRecipeIngredientIds() {
  return useQuery({
    queryKey: ['recipe-ingredient-ids'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('recipe_ingredients')
        .select('recipe_id, ingredient_id');
      if (error) throw new Error(error.message);

      const map = new Map<string, string[]>();
      for (const row of data ?? []) {
        const ids = map.get(row.recipe_id) ?? [];
        ids.push(row.ingredient_id);
        map.set(row.recipe_id, ids);
      }
      return map;
    },
  });
}

export interface GeneratePlanArgs {
  weekStart: IsoDate;
  mode: PlanMode;
}

/**
 * Generate and persist a week.
 *
 * Everything the generator needs is already in the query cache, so this is a
 * pure call plus one write. The generation parameters are stored alongside the
 * plan, which is what makes "why is Thursday like this?" answerable later.
 */
export function useGenerateMealPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const catalog = useRecipeCatalog();
  const ingredientNames = useRecipeIngredientNames();
  const ingredientIds = useRecipeIngredientIds();
  const favorites = useFavoriteRecipeIds();
  const preferences = usePreferences();
  const target = useActiveTarget();

  const isReady =
    catalog.isSuccess &&
    ingredientNames.isSuccess &&
    ingredientIds.isSuccess &&
    target.isSuccess &&
    Boolean(target.data);

  const mutation = useMutation<GeneratedPlan, Error, GeneratePlanArgs>({
    mutationFn: async ({ weekStart, mode }) => {
      if (!target.data) throw new Error('No daily targets yet — finish onboarding first.');

      const names = ingredientNames.data ?? new Map<string, string[]>();
      const ids = ingredientIds.data ?? new Map<string, string[]>();

      const recipes: PlannableRecipe[] = (catalog.data ?? []).map((row) => ({
        ...toRankableRecipe(row, names.get(row.id) ?? []),
        mealPrepRating: row.meal_prep_rating,
        ingredientIds: ids.get(row.id) ?? [],
      }));

      const params = {
        mode,
        targets: { energyKcal: target.data.energy_kcal, proteinG: target.data.protein_g },
        mealsPerDay: preferences.data?.meals_per_day ?? 4,
        dietType: (preferences.data?.diet_type ?? 'omnivore') as DietType,
        allergens: preferences.data?.allergens ?? [],
        dislikedFoods: preferences.data?.disliked_foods ?? [],
      };

      const generated = generateMealPlan({
        weekStart,
        mode,
        targets: params.targets,
        mealsPerDay: params.mealsPerDay,
        recipes,
        dietType: params.dietType,
        allergens: params.allergens,
        dislikedFoods: params.dislikedFoods,
        favoriteRecipeIds: favorites.data ?? [],
        ...(preferences.data?.max_cook_minutes
          ? { maxCookMinutes: preferences.data.max_cook_minutes }
          : {}),
      });

      const plan = await ensureMealPlan(user?.id as string, weekStart);
      await saveGeneratedPlan(plan, generated, params);
      return generated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PLAN_KEY] });
      void queryClient.invalidateQueries({ queryKey: [SHOPPING_KEY] });
    },
  });

  return { ...mutation, isReady };
}

export function useAddPlanEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      mealPlanDayId: string;
      mealType: MealType;
      recipeId: string;
      servings: number;
    }) => addPlanEntry(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });
}

export function useRemovePlanEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => removePlanEntry(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });
}

export function useUpdatePlanEntryServings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, servings }: { entryId: string; servings: number }) =>
      updatePlanEntryServings(entryId, servings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });
}

export function useCopyDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      plan,
      fromDayIndex,
      toDayIndex,
    }: {
      plan: FullMealPlan;
      fromDayIndex: number;
      toDayIndex: number;
    }) => copyDay(plan, fromDayIndex, toDayIndex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });
}

export function useCopyWeek() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: IsoDate; to: IsoDate }) =>
      copyWeek(user?.id as string, from, to),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });
}

export function useClearWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: FullMealPlan) => replacePlanEntries(plan, []),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PLAN_KEY] });
      void queryClient.invalidateQueries({ queryKey: [SHOPPING_KEY] });
    },
  });
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------

export function useShoppingList(mealPlanId: string | null) {
  return useQuery({
    queryKey: [SHOPPING_KEY, mealPlanId ?? 'none'],
    queryFn: () => fetchShoppingListForPlan(mealPlanId as string),
    enabled: Boolean(mealPlanId),
  });
}

export function useGenerateShoppingList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      plan,
      includeOptional = false,
    }: {
      plan: FullMealPlan;
      includeOptional?: boolean;
    }) => {
      const [planned, pantry] = await Promise.all([
        fetchPlannedIngredients(plan),
        fetchPantry(user?.id as string),
      ]);
      const lines = buildShoppingList(planned, pantry, { includeOptional });
      return saveShoppingList(user?.id as string, plan.id, lines);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SHOPPING_KEY] }),
  });
}

export function useToggleShoppingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, isChecked }: { itemId: string; isChecked: boolean }) =>
      setShoppingItemChecked(itemId, isChecked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SHOPPING_KEY] }),
  });
}

export function usePantry() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['pantry', userId ?? 'anonymous'],
    queryFn: () => fetchPantry(userId as string),
    enabled: Boolean(userId),
  });
}
