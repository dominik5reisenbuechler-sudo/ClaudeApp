import { View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import { Card, LoadingState, ProgressBar, Text } from '@/components/ui';
import { CATEGORY_LABELS } from '@/domain/gamification/achievements';
import type { AchievementStatus } from '@/domain/gamification/achievements';
import { LevelCard } from '@/features/gamification/LevelCard';
import { XpBreakdown } from '@/features/gamification/XpBreakdown';
import { ProgressSubNav } from '@/features/progress/ProgressSubNav';
import { useAchievements } from '@/hooks/useGamification';
import { useTheme } from '@/theme/ThemeProvider';
import { ACHIEVEMENT_CATEGORIES } from '@/types/domain';

/**
 * Achievements, grouped by category.
 *
 * Locked ones are shown with their progress rather than hidden behind a
 * question mark. A hidden achievement cannot be aimed at, and one that appears
 * out of nowhere teaches nothing about what the app is asking for.
 */
export default function AchievementsScreen() {
  const theme = useTheme();
  const { statuses, unlockedCount, isLoading } = useAchievements();

  if (isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Progress"
        title="Achievements"
        subtitle={`${unlockedCount} of ${statuses.length} unlocked`}
      />
      <ProgressSubNav active="achievements" />

      <LevelCard />

      <SectionHeader title="How XP is earned" />
      <XpBreakdown />

      {ACHIEVEMENT_CATEGORIES.map((category) => {
        const inCategory = statuses.filter((status) => status.definition.category === category);
        if (inCategory.length === 0) return null;

        return (
          <View key={category}>
            <SectionHeader title={CATEGORY_LABELS[category]} />
            <Card padding="md">
              <View style={{ gap: theme.spacing.lg }}>
                {inCategory.map((status) => (
                  <AchievementRow key={status.definition.id} status={status} />
                ))}
              </View>
            </Card>
          </View>
        );
      })}

      <Text variant="caption" tone="tertiary">
        Nothing here unlocks for losing weight or reaching a number on the scale. Achievements
        reward showing up, logging honestly and measuring consistently — the things that are
        actually within your control.
      </Text>
    </Screen>
  );
}

function AchievementRow({ status }: { status: AchievementStatus }) {
  const theme = useTheme();
  const unlocked = status.unlockedOn !== null;

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
      <Text variant="title" style={{ opacity: unlocked ? 1 : 0.3 }}>
        {status.definition.icon}
      </Text>

      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <Text variant="caption" tone={unlocked ? 'primary' : 'tertiary'} style={{ flex: 1 }}>
            {status.definition.name}
          </Text>
          <Text variant="mono" tone={unlocked ? 'success' : 'tertiary'}>
            {unlocked ? 'Unlocked' : `${status.value}/${status.definition.threshold}`}
          </Text>
        </View>

        <Text variant="caption" tone="tertiary">
          {status.definition.description}
        </Text>

        {unlocked ? null : (
          <ProgressBar value={status.fraction} target={1} height={3} showOvershoot={false} />
        )}
      </View>
    </View>
  );
}
