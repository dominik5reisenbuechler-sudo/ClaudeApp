import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { totalMinutes } from '@/domain/nutrition/recipeScaling';
import { useTheme } from '@/theme/ThemeProvider';
import type { RecipeRow } from '@/types/database';

interface RecipeCardProps {
  recipe: RecipeRow;
  onPress: () => void;
  /** Why this recipe is being suggested — shown when ranking produced it. */
  reason?: string;
  isFavorite?: boolean;
}

/**
 * One recipe in a list. Leads with the two numbers that matter on a
 * hypertrophy plan — kcal and protein per serving — plus total time.
 */
export function RecipeCard({ recipe, onPress, reason, isFavorite = false }: RecipeCardProps) {
  const theme = useTheme();
  const minutes = totalMinutes({ prepMinutes: recipe.prep_minutes, cookMinutes: recipe.cook_minutes });

  return (
    <Card padding="md" onPress={onPress}>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {isFavorite ? '♥ ' : ''}
              {recipe.title}
            </Text>
            <Text variant="caption" tone="tertiary">
              {minutes} min · {recipe.difficulty}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="mono">{Math.round(Number(recipe.calories_per_serving))} kcal</Text>
            <Text variant="caption" tone="tertiary">
              {recipe.protein_per_serving === null
                ? '— protein'
                : `${Math.round(Number(recipe.protein_per_serving))} g protein`}
            </Text>
          </View>
        </View>

        {reason ? (
          <Text variant="caption" tone="accent">
            {reason}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
