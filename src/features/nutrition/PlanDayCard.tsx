import { Pressable, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import { useTheme } from '@/theme/ThemeProvider';
import type { MealPlanDayWithEntries } from '@/services/mealPlanService';
import { MEAL_TYPES } from '@/types/domain';
import type { MealType } from '@/types/domain';
import { fromIsoDate } from '@/utils/date';

interface PlanDayCardProps {
  day: MealPlanDayWithEntries;
  /** Daily calorie target, so each day can show how close it lands. */
  targetKcal: number | null;
  onAdd: (mealType: MealType) => void;
  onRemove: (entryId: string) => void;
  onOpenRecipe: (recipeId: string) => void;
  onCopy: () => void;
}

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * One day of the week grid.
 *
 * A vertical card per day rather than a scrolling 7×4 table: on a phone, a
 * genuine grid means cells too small to read or a horizontal scroll that hides
 * half the week. Days stack, meals sit inside them.
 */
export function PlanDayCard({
  day,
  targetKcal,
  onAdd,
  onRemove,
  onOpenRecipe,
  onCopy,
}: PlanDayCardProps) {
  const theme = useTheme();

  const dayKcal = day.entries.reduce((sum, entry) => {
    if (!entry.recipe) return sum;
    return sum + Number(entry.recipe.calories_per_serving) * Number(entry.servings);
  }, 0);

  const dayProtein = day.entries.reduce((sum, entry) => {
    if (!entry.recipe || entry.recipe.protein_per_serving === null) return sum;
    return sum + Number(entry.recipe.protein_per_serving) * Number(entry.servings);
  }, 0);

  const drift = targetKcal && targetKcal > 0 ? Math.abs(dayKcal - targetKcal) / targetKcal : 0;
  const driftTone = day.entries.length === 0 ? 'tertiary' : drift > 0.15 ? 'warning' : 'success';

  return (
    <Card padding="md">
      <View style={{ gap: theme.spacing.md }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <View>
            <Text variant="bodyStrong">{WEEKDAY_NAMES[day.day_index] ?? `Day ${day.day_index + 1}`}</Text>
            <Text variant="caption" tone="tertiary">
              {formatDate(day.day_date)}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="mono" tone={driftTone}>
              {Math.round(dayKcal)} kcal
            </Text>
            <Text variant="caption" tone="tertiary">
              {Math.round(dayProtein)} g protein
            </Text>
          </View>
        </View>

        {MEAL_TYPES.map((mealType) => {
          const entries = day.entries.filter((entry) => entry.meal_type === mealType);
          return (
            <View key={mealType} style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" tone="tertiary">
                {MEAL_LABELS[mealType]}
              </Text>

              {entries.length === 0 ? (
                <Pressable accessibilityRole="button" onPress={() => onAdd(mealType)} hitSlop={4}>
                  <Text variant="caption" tone="accent">
                    + Add
                  </Text>
                </Pressable>
              ) : (
                entries.map((entry) => (
                  <View
                    key={entry.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      style={{ flex: 1 }}
                      onPress={() => entry.recipe_id && onOpenRecipe(entry.recipe_id)}
                    >
                      <Text variant="body" numberOfLines={1}>
                        {entry.recipe?.title ?? 'Removed recipe'}
                      </Text>
                    </Pressable>

                    <Text variant="caption" tone="tertiary">
                      ×{formatServings(Number(entry.servings))}
                    </Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${entry.recipe?.title ?? 'meal'}`}
                      hitSlop={8}
                      onPress={() => onRemove(entry.id)}
                    >
                      <Text variant="body" tone="tertiary">
                        ✕
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          );
        })}

        {day.entries.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={onCopy} hitSlop={6}>
            <Text variant="caption" tone="tertiary">
              Copy this day to…
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function formatDate(date: string): string {
  return fromIsoDate(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatServings(servings: number): string {
  return Number.isInteger(servings) ? `${servings}` : `${servings}`;
}
