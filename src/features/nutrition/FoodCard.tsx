import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export interface FoodCardData {
  name: string;
  brand: string | null;
  caloriesPer100g: number;
  proteinPer100g: number | null;
  /** Crowd-sourced entries say so, so the user knows whether to check a label. */
  verified: boolean;
  /** Marks a food the user created themselves. */
  isCustom?: boolean;
}

interface FoodCardProps {
  food: FoodCardData;
  onPress: () => void;
}

/**
 * One row in a food list.
 *
 * Shows energy and protein per 100 g, because those are the two figures that
 * decide whether a food is worth logging against a hypertrophy target. Unknown
 * protein renders as "—" rather than "0 g".
 */
export function FoodCard({ food, onPress }: FoodCardProps) {
  const theme = useTheme();

  return (
    <Card padding="sm" onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {food.name}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {[food.brand, food.isCustom ? 'Your food' : null, food.verified ? 'Verified' : null]
              .filter(Boolean)
              .join(' · ') || 'Per 100 g'}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="mono">{Math.round(food.caloriesPer100g)} kcal</Text>
          <Text variant="caption" tone="tertiary">
            {food.proteinPer100g === null ? '— protein' : `${round1(food.proteinPer100g)} g protein`}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
