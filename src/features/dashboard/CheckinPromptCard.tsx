import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card, Text } from '@/components/ui';
import { currentCheckinWeek, useCheckin, usePendingRecommendations } from '@/hooks/useCheckin';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The nudge back into the loop.
 *
 * It appears for exactly two reasons — a check-in is due, or a recommendation
 * is waiting for an answer — and disappears otherwise. A permanent card saying
 * "check in weekly" is wallpaper; one that appears when there is something to
 * do is a prompt.
 */
export function CheckinPromptCard() {
  const theme = useTheme();
  const router = useRouter();
  const weekStart = currentCheckinWeek();
  const checkin = useCheckin(weekStart);
  const pending = usePendingRecommendations();

  const pendingCount = pending.data?.length ?? 0;
  const needsCheckin = !checkin.isLoading && !checkin.data;

  if (checkin.isLoading || (!needsCheckin && pendingCount === 0)) return null;

  const title = pendingCount > 0 ? 'Recommendations waiting' : 'Weekly check-in is due';
  const body =
    pendingCount > 0
      ? `${pendingCount} ${pendingCount === 1 ? 'suggestion is' : 'suggestions are'} waiting for your answer. Nothing changes until you accept.`
      : 'Five minutes on how last week went is what lets us tell a real plateau from a rough week.';

  return (
    <Card tone="accent" onPress={() => router.push('/progress/checkin')}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" tone="tertiary">
          {title}
        </Text>
        <Text variant="caption" tone="secondary">
          {body}
        </Text>
      </View>
    </Card>
  );
}
