import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import {
  Callout,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
  Text,
} from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { DIETARY_TAG_LABELS } from '@/domain/nutrition/recipeRanking';
import { totalMinutes } from '@/domain/nutrition/recipeScaling';
import { NutritionSubNav } from '@/features/nutrition/NutritionSubNav';
import { RecipeCard } from '@/features/nutrition/RecipeCard';
import {
  useFavoriteRecipeIds,
  useRecipeCatalog,
  useRecipeRecommendations,
} from '@/hooks/useRecipes';
import { useTheme } from '@/theme/ThemeProvider';
import { MEAL_TYPES } from '@/types/domain';
import type { RecipeRow } from '@/types/database';

/** Tags a user filters by, in display order. */
const FILTER_TAGS = [
  'high_protein',
  'protein_50',
  'cut_friendly',
  'bulk_friendly',
  'under_15_min',
  'meal_prep',
  'budget',
  'vegetarian',
  'vegan',
  'low_calorie',
] as const;

/**
 * Recipe discovery.
 *
 * Leads with the ranked "fits what you have left" section, because that is the
 * question a user opens this screen with. Search and tag filters switch the
 * screen into browsing mode; the full catalogue by meal type sits below.
 */
export default function RecipesScreen() {
  const theme = useTheme();
  const router = useRouter();

  const catalog = useRecipeCatalog();
  const favorites = useFavoriteRecipeIds();
  const recommendations = useRecipeRecommendations();

  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const favoriteIds = useMemo(() => new Set(favorites.data ?? []), [favorites.data]);

  const filtered = useMemo(() => {
    const rows = catalog.data ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter((recipe) => {
      if (needle && !recipe.title.toLowerCase().includes(needle)) return false;
      if (activeTags.length > 0 && !activeTags.every((tag) => matchesTag(recipe, tag))) {
        return false;
      }
      return true;
    });
  }, [catalog.data, query, activeTags]);

  const isBrowsing = query.trim().length > 0 || activeTags.length > 0;

  if (catalog.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (catalog.isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load the recipes."
          onRetry={() => void catalog.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Nutrition" title="Recipes" />
      <NutritionSubNav active="recipes" />

      <SearchInput value={query} onChangeText={setQuery} placeholder="Search recipes" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.xl }}
      >
        {FILTER_TAGS.map((tag) => (
          <Chip
            key={tag}
            label={DIETARY_TAG_LABELS[tag] ?? tag}
            selected={activeTags.includes(tag)}
            onPress={() =>
              setActiveTags((current) =>
                current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
              )
            }
          />
        ))}
      </ScrollView>

      {isBrowsing ? (
        <BrowseResults
          recipes={filtered}
          favoriteIds={favoriteIds}
          onOpen={(id) => router.push(`/nutrition/recipe/${id}`)}
          onClear={() => {
            setQuery('');
            setActiveTags([]);
          }}
        />
      ) : (
        <>
          <RecommendedSection
            recommendations={recommendations}
            rows={catalog.data ?? []}
            favoriteIds={favoriteIds}
            onOpen={(id) => router.push(`/nutrition/recipe/${id}`)}
          />

          {MEAL_TYPES.map((meal) => {
            const rows = (catalog.data ?? []).filter((recipe) => recipe.meal_type === meal);
            if (rows.length === 0) return null;
            return (
              <View key={meal}>
                <SectionHeader title={MEAL_LABELS[meal]} />
                <View style={{ gap: theme.spacing.sm }}>
                  {rows.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      isFavorite={favoriteIds.has(recipe.id)}
                      onPress={() => router.push(`/nutrition/recipe/${recipe.id}`)}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}

function matchesTag(recipe: RecipeRow, tag: string): boolean {
  if (tag === 'under_15_min') {
    return (
      recipe.dietary_tags.includes(tag) ||
      totalMinutes({ prepMinutes: recipe.prep_minutes, cookMinutes: recipe.cook_minutes }) <= 15
    );
  }
  if (tag === 'vegetarian') {
    // Vegan recipes are vegetarian by definition; the filter should agree.
    return recipe.dietary_tags.includes('vegetarian') || recipe.dietary_tags.includes('vegan');
  }
  return recipe.dietary_tags.includes(tag);
}

function BrowseResults({
  recipes,
  favoriteIds,
  onOpen,
  onClear,
}: {
  recipes: RecipeRow[];
  favoriteIds: Set<string>;
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  const theme = useTheme();

  if (recipes.length === 0) {
    return (
      <EmptyState
        title="No recipes match"
        message="Try fewer filters, or a different search."
        actionLabel="Clear filters"
        onAction={onClear}
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          isFavorite={favoriteIds.has(recipe.id)}
          onPress={() => onOpen(recipe.id)}
        />
      ))}
    </View>
  );
}

function RecommendedSection({
  recommendations,
  rows,
  favoriteIds,
  onOpen,
}: {
  recommendations: ReturnType<typeof useRecipeRecommendations>;
  rows: readonly RecipeRow[];
  favoriteIds: Set<string>;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();

  if (recommendations.isLoading || recommendations.isError || !recommendations.result) return null;

  const { result, remainingKcal, remainingProteinG } = recommendations;

  // The ranking works on the domain shape; the cards render database rows.
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const top = result.ranked
    .map((scored) => ({ scored, row: rowById.get(scored.recipe.id) }))
    .filter((entry): entry is { scored: (typeof result.ranked)[number]; row: RecipeRow } =>
      entry.row !== undefined,
    )
    .slice(0, 3);

  if (top.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Fits what you have left" />
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="caption" tone="secondary">
          {remainingKcal > 0
            ? `You have about ${Math.round(remainingKcal)} kcal and ${Math.max(0, Math.round(remainingProteinG))} g protein left today.`
            : 'You have hit your calorie target for today — these are ranked for your next meal.'}
        </Text>

        {top.map(({ scored, row }) => (
          <RecipeCard
            key={row.id}
            recipe={row}
            isFavorite={favoriteIds.has(row.id)}
            {...(scored.reasons[0] ? { reason: scored.reasons[0] } : {})}
            onPress={() => onOpen(row.id)}
          />
        ))}

        {result.excluded.length > 0 ? (
          <Callout tone="info">
            {`${result.excluded.length} ${result.excluded.length === 1 ? 'recipe is' : 'recipes are'} hidden because of your allergies or diet.`}
          </Callout>
        ) : null}
      </View>
    </View>
  );
}
