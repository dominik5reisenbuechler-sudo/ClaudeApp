import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { nutritionForGrams } from '@/domain/nutrition/foodMath';
import { toFoodNutrition } from '@/features/nutrition/LogFoodSheet';
import { createFoodEntry } from '@/services/foodEntryService';
import {
  createSavedMealFromEntries,
  deleteSavedMeal,
  fetchSavedMeals,
} from '@/services/savedMealService';
import type { SavedMealWithItems } from '@/services/savedMealService';
import type { FoodEntryRow } from '@/types/database';
import type { IsoDate, MealType } from '@/types/domain';
import { todayIsoDate } from '@/utils/date';

export function useSavedMeals() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['saved-meals', userId ?? 'anonymous'],
    queryFn: () => fetchSavedMeals(userId as string),
    enabled: Boolean(userId),
  });
}

export function useSaveMealFromEntries() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      mealType,
      entries,
    }: {
      name: string;
      mealType: MealType | null;
      entries: readonly FoodEntryRow[];
    }) => createSavedMealFromEntries(user?.id as string, name, mealType, entries),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-meals'] }),
  });
}

export function useDeleteSavedMeal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (savedMealId: string) => deleteSavedMeal(user?.id as string, savedMealId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-meals'] }),
  });
}

/**
 * Log every item of a saved meal as an individual food entry.
 *
 * Individual entries rather than one blob: each keeps its own food link and
 * snapshot, so the user can remove or adjust one component afterwards exactly
 * as if they had logged the foods by hand. Snapshots are computed from the
 * foods' current data via the same `nutritionForGrams` used everywhere else.
 */
export function useLogSavedMeal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      savedMeal,
      mealType,
      loggedOn = todayIsoDate(),
    }: {
      savedMeal: SavedMealWithItems;
      mealType: MealType;
      loggedOn?: IsoDate;
    }) => {
      for (const item of savedMeal.items) {
        const grams = Number(item.quantity_g);
        const computed = nutritionForGrams(toFoodNutrition(item.food), grams);
        await createFoodEntry(user?.id as string, {
          loggedOn,
          mealType,
          displayName: item.food.name,
          quantity: grams,
          unit: 'g',
          foodId: item.food_id,
          savedMealId: null,
          ...computed,
        });
      }
      return savedMeal.items.length;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['food-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['recent-foods'] });
    },
  });
}
