import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { useStreaks } from '@/hooks/useGamification';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The five streaks.
 *
 * A streak at zero is shown greyed rather than hidden. Hiding it would make
 * the card grow and shrink as habits come and go, and the point of the row is
 * to show all five at a glance — including the one that lapsed.
 *
 * "Today counts once you log it" is the pending state, not a broken streak.
 * The distinction matters: a user who opens the app at breakfast should not be
 * told they lost fourteen days.
 */
export function StreaksCard() {
  const theme = useTheme();
  const { streaks, isLoading } = useStreaks();

  if (isLoading) return null;
  if (streaks.every((streak) => streak.result.current === 0 && streak.result.longest === 0)) {
    return null;
  }

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="label" tone="tertiary">
          Streaks
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {streaks.map((streak) => {
            const active = streak.result.current > 0;
            return (
              <View key={streak.kind} style={{ alignItems: 'center', gap: 2, flex: 1 }}>
                <Text variant="title" tone={active ? 'accent' : 'tertiary'}>
                  {streak.result.current}
                </Text>
                <Text variant="caption" tone="tertiary" align="center">
                  {streak.label}
                </Text>
                <Text variant="caption" tone="tertiary" align="center">
                  {streak.isWeekly ? 'weeks' : 'days'}
                </Text>
              </View>
            );
          })}
        </View>

        <Text variant="caption" tone="tertiary">
          {describe(streaks)}
        </Text>
      </View>
    </Card>
  );
}

function describe(streaks: ReturnType<typeof useStreaks>['streaks']): string {
  const pending = streaks.filter((streak) => streak.result.isPendingToday);
  const training = streaks.find((streak) => streak.kind === 'training');

  if (pending.length > 0) {
    const names = pending.map((streak) => streak.label.toLowerCase()).join(', ');
    return `Your ${names} ${pending.length === 1 ? 'streak is' : 'streaks are'} still standing — today counts once you log it.`;
  }

  if (training && training.result.current > 0 && !training.isWeekly) {
    return 'Rest days do not break your training streak. Following the programme is the point.';
  }

  return 'Streaks are counted from your logs, so they are always as accurate as what you recorded.';
}
