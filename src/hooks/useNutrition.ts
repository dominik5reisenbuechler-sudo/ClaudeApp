import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { getFoodProvider } from '@/integrations/foodProviders';
import type { FoodLookupResult, ProviderFood } from '@/integrations/foodProviders';
import {
  cacheProviderFood,
  createCustomFood,
  fetchFavoriteFoods,
  fetchRecentFoods,
  findFoodByBarcode,
  searchLocalFoods,
  setFoodFavorite,
} from '@/services/foodService';
import type { CustomFoodInput } from '@/services/foodService';
import {
  createFoodEntry,
  deleteFoodEntry,
  fetchFoodEntries,
  toLoggedEntries,
  updateFoodEntryQuantity,
} from '@/services/foodEntryService';
import type { CreateFoodEntryInput } from '@/services/foodEntryService';
import type { FoodRow } from '@/types/database';
import type { IsoDate } from '@/types/domain';
import { todayIsoDate } from '@/utils/date';

/**
 * Nutrition queries and mutations.
 *
 * Food search deliberately runs two sources in sequence: the local catalogue
 * first (instant, includes the user's own foods and anything previously
 * scanned), then the external provider. A user's own custom food should always
 * outrank a crowd-sourced guess at the same name.
 */

const FOOD_ENTRY_KEY = 'food-entries';

export function useFoodEntries(date: IsoDate = todayIsoDate()) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [FOOD_ENTRY_KEY, userId ?? 'anonymous', date],
    queryFn: () => fetchFoodEntries(userId as string, date, date),
    enabled: Boolean(userId),
  });
}

/** Entries across a range, for the dashboard and later the weekly analysis. */
export function useFoodEntriesInRange(from: IsoDate, to: IsoDate) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [FOOD_ENTRY_KEY, userId ?? 'anonymous', from, to],
    queryFn: () => fetchFoodEntries(userId as string, from, to),
    enabled: Boolean(userId),
  });
}

export interface FoodSearchResults {
  local: FoodRow[];
  /** Provider hits not already present locally. */
  external: Awaited<ReturnType<ReturnType<typeof getFoodProvider>['searchFoods']>>;
  providerFailed: boolean;
}

export function useFoodSearch(query: string) {
  const trimmed = query.trim();

  return useQuery<FoodSearchResults>({
    queryKey: ['food-search', trimmed],
    enabled: trimmed.length >= 2,
    // Search results change rarely and the query is re-run on every keystroke
    // pause; a longer stale time keeps typing responsive.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const local = await searchLocalFoods(trimmed);

      // The provider is best-effort. A search that returns the local catalogue
      // is far better than one that fails entirely because a third party is
      // down, so its failure is reported rather than thrown.
      try {
        const external = await getFoodProvider().searchFoods(trimmed, { limit: 20 });
        const seenBarcodes = new Set(local.map((food) => food.barcode).filter(Boolean));
        return {
          local,
          external: external.filter((food) => !food.barcode || !seenBarcodes.has(food.barcode)),
          providerFailed: false,
        };
      } catch {
        return { local, external: [], providerFailed: true };
      }
    },
  });
}

export function useRecentFoods() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['recent-foods', userId ?? 'anonymous'],
    queryFn: () => fetchRecentFoods(userId as string),
    enabled: Boolean(userId),
  });
}

export function useFavoriteFoods() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['favorite-foods', userId ?? 'anonymous'],
    queryFn: () => fetchFavoriteFoods(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * The outcome of resolving a scanned barcode.
 *
 * A discriminated union rather than the provider's own result type, because by
 * the time a lookup succeeds the food has been persisted — callers get a
 * `FoodRow` with an id they can log against, never a transient provider object.
 */
export type BarcodeResolution =
  | { status: 'found'; food: FoodRow }
  | {
      status: 'failed';
      reason: Extract<FoodLookupResult, { ok: false }>['reason'];
      message: string;
      partial?: Partial<ProviderFood>;
    };

/**
 * Barcode lookup: local cache first, then the provider, caching what it finds.
 * A product scanned once by anyone resolves instantly for everyone afterwards.
 */
export function useBarcodeLookup() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<BarcodeResolution, Error, string>({
    mutationFn: async (barcode: string): Promise<BarcodeResolution> => {
      const cached = await findFoodByBarcode(barcode);
      if (cached) return { status: 'found', food: cached };

      const provider = getFoodProvider();
      const result = await provider.getFoodByBarcode(barcode);
      if (!result.ok) {
        return {
          status: 'failed',
          reason: result.reason,
          message: result.message,
          ...(result.partial ? { partial: result.partial } : {}),
        };
      }

      const stored = await cacheProviderFood(result.food, provider.id, user?.id as string);
      return { status: 'found', food: stored };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['food-search'] });
    },
  });
}

export function useCreateCustomFood() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CustomFoodInput) => createCustomFood(input, user?.id as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['food-search'] });
      void queryClient.invalidateQueries({ queryKey: ['recent-foods'] });
    },
  });
}

export function useLogFoodEntry() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFoodEntryInput) => createFoodEntry(user?.id as string, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [FOOD_ENTRY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['recent-foods'] });
    },
  });
}

export function useDeleteFoodEntry() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryId: string) => deleteFoodEntry(user?.id as string, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FOOD_ENTRY_KEY] }),
  });
}

export function useUpdateFoodEntryQuantity() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entryId,
      ...patch
    }: Parameters<typeof updateFoodEntryQuantity>[2] & { entryId: string }) =>
      updateFoodEntryQuantity(user?.id as string, entryId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FOOD_ENTRY_KEY] }),
  });
}

export function useToggleFoodFavorite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ foodId, favorite }: { foodId: string; favorite: boolean }) =>
      setFoodFavorite(user?.id as string, foodId, favorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorite-foods'] }),
  });
}

export { toLoggedEntries };
