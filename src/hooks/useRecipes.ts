import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { remainingAgainst, totalsFor } from '@/domain/nutrition/dailyTotals';
import { rankRecipes } from '@/domain/nutrition/recipeRanking';
import type { RankingResult } from '@/domain/nutrition/recipeRanking';
import {
  fetchFavoriteRecipeIds,
  fetchIngredientNamesByRecipe,
  fetchRecipe,
  fetchRecipeIngredients,
  fetchRecipeInstructions,
  fetchRecipes,
  setRecipeFavorite,
  toRankableRecipe,
} from '@/services/recipeService';
import { toLoggedEntries, useFoodEntries } from './useNutrition';
import { usePreferences, useActiveTarget } from './useProfile';
import type { DietType } from '@/types/domain';
import { todayIsoDate } from '@/utils/date';

/**
 * Recipe queries.
 *
 * The catalogue changes rarely (it is seeded content plus the user's own
 * recipes), so it gets a long stale time. The *ranking* over it changes every
 * time the user logs a meal — which is why ranking is a memo over queries
 * rather than a query of its own: it re-derives instantly from cached data.
 */

export function useRecipeCatalog() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: fetchRecipes,
    staleTime: 30 * 60_000,
  });
}

export function useRecipeIngredientNames() {
  return useQuery({
    queryKey: ['recipe-ingredient-names'],
    queryFn: fetchIngredientNamesByRecipe,
    staleTime: 30 * 60_000,
  });
}

export function useRecipeDetail(recipeId: string) {
  return useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: async () => {
      const [recipe, ingredients, instructions] = await Promise.all([
        fetchRecipe(recipeId),
        fetchRecipeIngredients(recipeId),
        fetchRecipeInstructions(recipeId),
      ]);
      return { recipe, ingredients, instructions };
    },
    enabled: recipeId.length > 0,
  });
}

export function useFavoriteRecipeIds() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['recipe-favorites', userId ?? 'anonymous'],
    queryFn: () => fetchFavoriteRecipeIds(userId as string),
    enabled: Boolean(userId),
  });
}

export function useToggleRecipeFavorite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId, favorite }: { recipeId: string; favorite: boolean }) =>
      setRecipeFavorite(user?.id as string, recipeId, favorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipe-favorites'] }),
  });
}

export interface RecommendationState {
  result: RankingResult | null;
  remainingKcal: number;
  remainingProteinG: number;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The "what should I eat with what I have left?" ranking.
 *
 * Composes today's remaining macros with the user's preferences and the
 * catalogue, all through the pure `rankRecipes`. Every input is already a
 * cached query, so this recomputes synchronously when a meal is logged.
 */
export function useRecipeRecommendations(): RecommendationState {
  const today = todayIsoDate();
  const catalog = useRecipeCatalog();
  const ingredientNames = useRecipeIngredientNames();
  const favorites = useFavoriteRecipeIds();
  const preferences = usePreferences();
  const target = useActiveTarget();
  const entries = useFoodEntries(today);

  const isLoading =
    catalog.isLoading ||
    ingredientNames.isLoading ||
    favorites.isLoading ||
    preferences.isLoading ||
    target.isLoading ||
    entries.isLoading;
  const isError =
    catalog.isError ||
    ingredientNames.isError ||
    favorites.isError ||
    preferences.isError ||
    target.isError ||
    entries.isError;

  return useMemo(() => {
    if (isLoading || isError || !target.data || !catalog.data) {
      return { result: null, remainingKcal: 0, remainingProteinG: 0, isLoading, isError };
    }

    const totals = totalsFor(toLoggedEntries(entries.data ?? []));
    const remaining = remainingAgainst(totals, {
      energyKcal: target.data.energy_kcal,
      proteinG: target.data.protein_g,
      carbsG: target.data.carbs_g,
      fatG: target.data.fat_g,
      fiberG: target.data.fiber_g,
    });

    const names = ingredientNames.data ?? new Map<string, string[]>();
    const rankable = catalog.data.map((row) => toRankableRecipe(row, names.get(row.id) ?? []));

    const result = rankRecipes(rankable, {
      remainingKcal: remaining.energyKcal,
      remainingProteinG: remaining.proteinG,
      dietType: (preferences.data?.diet_type ?? 'omnivore') as DietType,
      allergens: preferences.data?.allergens ?? [],
      dislikedFoods: preferences.data?.disliked_foods ?? [],
      favoriteRecipeIds: favorites.data ?? [],
    });

    return {
      result,
      remainingKcal: remaining.energyKcal,
      remainingProteinG: remaining.proteinG,
      isLoading: false,
      isError: false,
    };
  }, [
    isLoading,
    isError,
    target.data,
    catalog.data,
    entries.data,
    ingredientNames.data,
    preferences.data,
    favorites.data,
  ]);
}
