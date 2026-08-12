import { View } from 'react-native';

import { Card, ProgressBar, Text } from '@/components/ui';
import { useLevel } from '@/hooks/useGamification';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Level and XP.
 *
 * XP is encouragement, not evidence — nothing in the adaptive engine reads it,
 * and this card is deliberately smaller and quieter than the ones showing real
 * numbers. A points total that competes visually with a calorie target would
 * be telling the user the wrong thing about which one matters.
 */
export function LevelCard({ onPress }: { onPress?: () => void }) {
  const theme = useTheme();
  const { totalXp, progress, isLoading } = useLevel();

  if (isLoading) return null;

  return (
    <Card {...(onPress ? { onPress } : {})}>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="heading">Level {progress.level}</Text>
          <Text variant="mono" tone="tertiary">
            {totalXp.toLocaleString('en-US')} XP
          </Text>
        </View>

        <ProgressBar
          value={progress.xpIntoLevel}
          target={Math.max(progress.xpForNextLevel, 1)}
          height={4}
          showOvershoot={false}
        />

        <Text variant="caption" tone="tertiary">
          {(progress.xpForNextLevel - progress.xpIntoLevel).toLocaleString('en-US')} XP to level{' '}
          {progress.level + 1}
        </Text>
      </View>
    </Card>
  );
}
