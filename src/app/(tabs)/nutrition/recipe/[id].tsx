import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import {
  Button,
  Callout,
  Card,
  Chip,
  ErrorState,
  LoadingState,
  Text,
} from '@/components/ui';
import { DIETARY_TAG_LABELS } from '@/domain/nutrition/recipeRanking';
import { scaleRecipe, totalMinutes } from '@/domain/nutrition/recipeScaling';
import { LogRecipeSheet } from '@/features/nutrition/LogRecipeSheet';
import {
  useFavoriteRecipeIds,
  useRecipeDetail,
  useToggleRecipeFavorite,
} from '@/hooks/useRecipes';
import { toScalableRecipe } from '@/services/recipeService';
import { useTheme } from '@/theme/ThemeProvider';

/** Serving counts the stepper offers. */
const SERVING_OPTIONS = [1, 2, 3, 4, 6] as const;

/**
 * Recipe detail: macros per serving, a servings selector that rescales the
 * ingredient list live, instructions, favourite toggle, and logging.
 *
 * The scaled preview and the logged entry both come from `scaleRecipe` — one
 * implementation of the maths, so the kitchen view and the diary entry cannot
 * disagree.
 */
export default function RecipeDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const detail = useRecipeDetail(id ?? '');
  const favorites = useFavoriteRecipeIds();
  const toggleFavorite = useToggleRecipeFavorite();

  const [servings, setServings] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const recipe = detail.data?.recipe ?? null;
  const isFavorite = Boolean(recipe && (favorites.data ?? []).includes(recipe.id));

  const scalable = useMemo(() => {
    if (!recipe || !detail.data) return null;
    return toScalableRecipe(recipe, detail.data.ingredients);
  }, [recipe, detail.data]);

  const activeServings = servings ?? recipe?.servings ?? 1;

  const scaled = useMemo(() => {
    if (!scalable) return null;
    return scaleRecipe(scalable, activeServings);
  }, [scalable, activeServings]);

  if (detail.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (detail.isError || !recipe || !scalable || !scaled) {
    return (
      <Screen>
        <ErrorState
          title="Recipe not found"
          message="It may have been removed, or the link is stale."
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const minutes = totalMinutes({
    prepMinutes: recipe.prep_minutes,
    cookMinutes: recipe.cook_minutes,
  });

  return (
    <Screen
      footer={
        <Button label="Log this recipe" onPress={() => setLogOpen(true)} />
      }
    >
      <ScreenHeader
        eyebrow={`${minutes} min · ${recipe.difficulty}`}
        title={recipe.title}
        {...(recipe.description ? { subtitle: recipe.description } : {})}
        onBack={() => router.back()}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            hitSlop={8}
            onPress={() =>
              void toggleFavorite.mutateAsync({ recipeId: recipe.id, favorite: !isFavorite })
            }
          >
            <Text variant="title" tone={isFavorite ? 'accent' : 'tertiary'}>
              {isFavorite ? '♥' : '♡'}
            </Text>
          </Pressable>
        }
      />

      {recipe.dietary_tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {recipe.dietary_tags.map((tag) => (
            <Chip key={tag} label={DIETARY_TAG_LABELS[tag] ?? tag} />
          ))}
        </View>
      ) : null}

      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="label" tone="tertiary">
            Per serving
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xl }}>
            <Macro label="Calories" value={`${Math.round(scaled.perServing.energyKcal)}`} unit="kcal" />
            <Macro label="Protein" value={fmt(scaled.perServing.proteinG)} unit="g" />
            <Macro label="Carbs" value={fmt(scaled.perServing.carbsG)} unit="g" />
            <Macro label="Fat" value={fmt(scaled.perServing.fatG)} unit="g" />
            <Macro label="Fibre" value={fmt(scaled.perServing.fiberG)} unit="g" />
          </View>
        </View>
      </Card>

      {recipe.allergens.length > 0 ? (
        <Callout tone="warning" title="Contains">
          {recipe.allergens.map((allergen) => allergen.replace(/_/g, ' ')).join(', ')}
        </Callout>
      ) : null}

      <View>
        <SectionHeader title={`Ingredients · ${activeServings} ${activeServings === 1 ? 'serving' : 'servings'}`} />
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {SERVING_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={`${option}`}
                selected={activeServings === option}
                onPress={() => setServings(option)}
              />
            ))}
          </View>

          <Card padding="md">
            <View style={{ gap: theme.spacing.sm }}>
              {scaled.ingredients.map((ingredient, index) => (
                <View
                  key={`${ingredient.ingredientId}-${index}`}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}
                >
                  <Text variant="body" style={{ flex: 1 }}>
                    {ingredient.name}
                    {ingredient.preparationNote ? (
                      <Text variant="caption" tone="tertiary">
                        {' '}
                        — {ingredient.preparationNote}
                      </Text>
                    ) : null}
                    {ingredient.isOptional ? (
                      <Text variant="caption" tone="tertiary">
                        {' '}
                        (optional)
                      </Text>
                    ) : null}
                  </Text>
                  <Text variant="mono" tone="secondary">
                    {ingredient.quantity} {ingredient.unit}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {scaled.hasFixedIngredients && scaled.factor !== 1 ? (
            <Text variant="caption" tone="tertiary">
              Seasonings and pan oil are kept constant — they season the dish, not the servings.
            </Text>
          ) : null}
        </View>
      </View>

      <View>
        <SectionHeader title="Method" />
        <View style={{ gap: theme.spacing.md }}>
          {(detail.data?.instructions ?? []).map((step) => (
            <View key={step.id} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Text variant="bodyStrong" tone="accent">
                {step.step_number}
              </Text>
              <Text variant="body" tone="secondary" style={{ flex: 1 }}>
                {step.instruction}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text variant="caption" tone="tertiary">
        Nutrition figures are per-serving estimates from standard ingredient data.
      </Text>

      <LogRecipeSheet
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        defaultMealType={recipe.meal_type}
        recipe={scalable}
        onLogged={() => router.dismissTo('/nutrition')}
      />
    </Screen>
  );
}

function Macro({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="heading">
        {value}
        {value === '—' ? '' : ` ${unit}`}
      </Text>
    </View>
  );
}

/** Unknown stays visibly unknown rather than becoming a confident zero. */
function fmt(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}`;
}
