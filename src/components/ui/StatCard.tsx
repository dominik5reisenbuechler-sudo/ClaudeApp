import { View } from 'react-native';

import { Card } from './Card';
import { Text } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

interface StatCardProps {
  label: string;
  value: string;
  /** Secondary line: a 7-day average, a trend, a target. */
  detail?: string;
  /** Direction of change, when one is meaningful. */
  trend?: 'up' | 'down' | 'flat';
  /**
   * Whether an upward trend is a good thing. On a cut it is not, so the colour
   * cannot be derived from direction alone.
   */
  trendIsPositive?: boolean;
  onPress?: () => void;
}

export function StatCard({
  label,
  value,
  detail,
  trend,
  trendIsPositive = true,
  onPress,
}: StatCardProps) {
  const theme = useTheme();

  const trendTone =
    trend === undefined || trend === 'flat' ? 'tertiary' : trendIsPositive ? 'success' : 'warning';
  const trendGlyph = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'flat' ? '→' : '';

  return (
    <Card padding="md" onPress={onPress} style={{ flex: 1, minWidth: 140 }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" tone="tertiary">
          {label}
        </Text>
        <Text variant="title">{value}</Text>
        {detail ? (
          <Text variant="caption" tone={trendTone}>
            {trendGlyph ? `${trendGlyph} ` : ''}
            {detail}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
