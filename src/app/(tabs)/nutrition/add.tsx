import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Callout, Card, EmptyState, LoadingState, SearchInput, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { CustomFoodSheet } from '@/features/nutrition/CustomFoodSheet';
import { FoodCard } from '@/features/nutrition/FoodCard';
import { LogFoodSheet } from '@/features/nutrition/LogFoodSheet';
import { QuickAddSheet } from '@/features/nutrition/QuickAddSheet';
import { getFoodProvider } from '@/integrations/foodProviders';
import type { ProviderFood } from '@/integrations/foodProviders';
import {
  useBarcodeLookup,
  useFavoriteFoods,
  useFoodSearch,
  useRecentFoods,
} from '@/hooks/useNutrition';
import { useDeleteSavedMeal, useLogSavedMeal, useSavedMeals } from '@/hooks/useSavedMeals';
import { cacheProviderFood } from '@/services/foodService';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MEAL_TYPES } from '@/types/domain';
import type { MealType } from '@/types/domain';
import type { FoodRow } from '@/types/database';
import { todayIsoDate } from '@/utils/date';

/**
 * Find and log a food.
 *
 * With no query, the screen offers recents and favourites — people eat the same
 * things repeatedly, and a list of what they already eat beats a search box
 * most of the time. Searching queries the local catalogue first, then the
 * provider, so a user's own foods always outrank a crowd-sourced guess.
 */
export default function AddFoodScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ meal?: string }>();
  const today = todayIsoDate();

  const mealType: MealType = MEAL_TYPES.includes(params.meal as MealType)
    ? (params.meal as MealType)
    : 'snack';

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<FoodRow | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useFoodSearch(query);
  const recents = useRecentFoods();
  const favorites = useFavoriteFoods();
  const savedMeals = useSavedMeals();
  const logSavedMeal = useLogSavedMeal();
  const deleteSavedMeal = useDeleteSavedMeal();
  const barcodeLookup = useBarcodeLookup();

  const isSearching = query.trim().length >= 2;

  /** Cache a provider result locally, then open the log sheet on the saved row. */
  const selectProviderFood = async (food: ProviderFood) => {
    setError(null);
    try {
      const stored = await cacheProviderFood(food, getFoodProvider().id, user?.id as string);
      setSelected(stored);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open that food.');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow={`Add to ${MEAL_LABELS[mealType].toLowerCase()}`}
        title="Find a food"
        onBack={() => router.back()}
      />

      <SearchInput value={query} onChangeText={setQuery} placeholder="Search foods" />

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Button
          label="Scan barcode"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => router.push(`/nutrition/scan?meal=${mealType}`)}
        />
        <Button
          label="Quick add"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => setQuickAddOpen(true)}
        />
        <Button
          label="New food"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => setCustomOpen(true)}
        />
      </View>

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      {isSearching ? (
        <SearchResults
          isLoading={search.isLoading}
          local={search.data?.local ?? []}
          external={search.data?.external ?? []}
          providerFailed={search.data?.providerFailed ?? false}
          onSelectLocal={setSelected}
          onSelectExternal={(food) => void selectProviderFood(food)}
          onCreate={() => setCustomOpen(true)}
        />
      ) : (
        <>
          {savedMeals.data && savedMeals.data.length > 0 ? (
            <View>
              <SectionHeader title="Saved meals" />
              <View style={{ gap: theme.spacing.sm }}>
                {savedMeals.data.map((meal) => (
                  <Card
                    key={meal.id}
                    padding="sm"
                    onPress={() => {
                      void logSavedMeal
                        .mutateAsync({ savedMeal: meal, mealType })
                        .then(() => router.back())
                        .catch((caught: unknown) =>
                          setError(
                            caught instanceof Error ? caught.message : 'Could not log that meal.',
                          ),
                        );
                    }}
                  >
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {meal.name}
                        </Text>
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>
                          {meal.items.map((item) => item.food.name).join(', ')}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete saved meal ${meal.name}`}
                        hitSlop={8}
                        onPress={() => void deleteSavedMeal.mutateAsync(meal.id)}
                      >
                        <Text variant="body" tone="tertiary">
                          ✕
                        </Text>
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </View>
              {logSavedMeal.isPending ? <LoadingState label="Logging that meal…" /> : null}
            </View>
          ) : null}

          {favorites.data && favorites.data.length > 0 ? (
            <View>
              <SectionHeader title="Favourites" />
              <View style={{ gap: theme.spacing.sm }}>
                {favorites.data.map((food) => (
                  <FoodCard
                    key={food.id}
                    food={toCardData(food)}
                    onPress={() => setSelected(food)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Recent" />
            {recents.isLoading ? (
              <LoadingState />
            ) : recents.data && recents.data.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                {recents.data.map((food) => (
                  <FoodCard
                    key={food.id}
                    food={toCardData(food)}
                    onPress={() => setSelected(food)}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title="Nothing logged yet"
                message="Search for a food, scan a barcode, or add your own. Anything you log shows up here for next time."
              />
            )}
          </View>
        </>
      )}

      <Text variant="caption" tone="tertiary">
        {getFoodProvider().attribution}
      </Text>

      <LogFoodSheet
        food={selected}
        mealType={mealType}
        loggedOn={today}
        onClose={() => setSelected(null)}
        onLogged={() => router.back()}
      />

      <QuickAddSheet
        visible={quickAddOpen}
        mealType={mealType}
        loggedOn={today}
        onClose={() => setQuickAddOpen(false)}
      />

      <CustomFoodSheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        onCreated={(food) => setSelected(food)}
      />

      {barcodeLookup.isPending ? <LoadingState label="Looking up that barcode…" /> : null}
    </Screen>
  );
}

interface SearchResultsProps {
  isLoading: boolean;
  local: FoodRow[];
  external: ProviderFood[];
  providerFailed: boolean;
  onSelectLocal: (food: FoodRow) => void;
  onSelectExternal: (food: ProviderFood) => void;
  onCreate: () => void;
}

function SearchResults({
  isLoading,
  local,
  external,
  providerFailed,
  onSelectLocal,
  onSelectExternal,
  onCreate,
}: SearchResultsProps) {
  const theme = useTheme();

  if (isLoading) return <LoadingState label="Searching…" />;

  if (local.length === 0 && external.length === 0) {
    return (
      <EmptyState
        title="No matches"
        message="Nothing found for that search. You can add the food yourself — it will be saved to your account for next time."
        actionLabel="Add it yourself"
        onAction={onCreate}
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      {providerFailed ? (
        <Callout tone="info">
          We could not reach the online food database, so these are only foods already saved here.
        </Callout>
      ) : null}

      {local.length > 0 ? (
        <View>
          <SectionHeader title="Saved foods" />
          <View style={{ gap: theme.spacing.sm }}>
            {local.map((food) => (
              <FoodCard key={food.id} food={toCardData(food)} onPress={() => onSelectLocal(food)} />
            ))}
          </View>
        </View>
      ) : null}

      {external.length > 0 ? (
        <View>
          <SectionHeader title="Online database" />
          <View style={{ gap: theme.spacing.sm }}>
            {external.map((food) => (
              <FoodCard
                key={food.externalId}
                food={{
                  name: food.name,
                  brand: food.brand,
                  caloriesPer100g: food.caloriesPer100g,
                  proteinPer100g: food.proteinPer100g,
                  verified: food.verified,
                }}
                onPress={() => onSelectExternal(food)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function toCardData(food: FoodRow) {
  return {
    name: food.name,
    brand: food.brand,
    caloriesPer100g: Number(food.calories_per_100g),
    proteinPer100g: food.protein_per_100g === null ? null : Number(food.protein_per_100g),
    verified: food.verified,
    isCustom: food.source === 'user',
  };
}
