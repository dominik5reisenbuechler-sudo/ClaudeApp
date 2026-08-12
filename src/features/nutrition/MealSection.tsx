import { Pressable, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { MEAL_LABELS } from '@/domain/nutrition/dailyTotals';
import type { DailyTotals } from '@/domain/nutrition/dailyTotals';
import { useTheme } from '@/theme/ThemeProvider';
import type { FoodEntryRow } from '@/types/database';
import type { MealType } from '@/types/domain';

interface MealSectionProps {
  mealType: MealType;
  entries: readonly FoodEntryRow[];
  totals: DailyTotals;
  onAdd: () => void;
  onRemove: (entryId: string) => void;
  /** Offered only when the meal contains something a saved meal can hold. */
  onSaveAsMeal?: () => void;
}

export function MealSection({
  mealType,
  entries,
  totals,
  onAdd,
  onRemove,
  onSaveAsMeal,
}: MealSectionProps) {
  const theme = useTheme();

  return (
    <Card padding="md">
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="bodyStrong">{MEAL_LABELS[mealType]}</Text>
          <Text variant="mono" tone="tertiary">
            {Math.round(totals.energyKcal)} kcal
          </Text>
        </View>

        {entries.length === 0 ? (
          <Text variant="caption" tone="tertiary">
            Nothing logged yet
          </Text>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {entries.map((entry) => (
              <View
                key={entry.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body" numberOfLines={1}>
                    {entry.display_name}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {formatQuantity(entry)} ·{' '}
                    {entry.protein_g === null
                      ? 'protein unknown'
                      : `${round1(Number(entry.protein_g))} g protein`}
                  </Text>
                </View>

                <Text variant="mono" tone="secondary">
                  {Math.round(Number(entry.energy_kcal))}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${entry.display_name}`}
                  hitSlop={8}
                  onPress={() => onRemove(entry.id)}
                >
                  <Text variant="body" tone="tertiary">
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: theme.spacing.xl }}>
          <Pressable accessibilityRole="button" onPress={onAdd} hitSlop={6}>
            <Text variant="caption" tone="accent">
              + Add food
            </Text>
          </Pressable>
          {onSaveAsMeal && hasSavableEntries(entries) ? (
            <Pressable accessibilityRole="button" onPress={onSaveAsMeal} hitSlop={6}>
              <Text variant="caption" tone="tertiary">
                Save as meal
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/** Only gram-based food entries can go into a saved meal. */
function hasSavableEntries(entries: readonly FoodEntryRow[]): boolean {
  return entries.some((entry) => entry.food_id !== null && entry.unit === 'g');
}

function formatQuantity(entry: FoodEntryRow): string {
  const quantity = Number(entry.quantity);
  if (entry.unit === 'entry') return 'Quick add';
  return `${round1(quantity)} ${entry.unit}`;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
