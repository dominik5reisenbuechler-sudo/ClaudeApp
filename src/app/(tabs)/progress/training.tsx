import { View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import { BarChart, Card, LoadingState, ProgressBar, Text } from '@/components/ui';
import { ProgressSubNav } from '@/features/progress/ProgressSubNav';
import { useTrainingConsistency } from '@/hooks/useProgress';
import { useWeeklyVolume } from '@/hooks/useTraining';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Training analytics: consistency and weekly volume per muscle.
 *
 * Adherence is measured against the user's own plan, not an ideal — someone who
 * trains three times a week and planned three is at 100%.
 */
export default function TrainingProgressScreen() {
  const theme = useTheme();
  const consistency = useTrainingConsistency();
  const volume = useWeeklyVolume();

  if (consistency.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const { summary, weekly, plannedPerWeek } = consistency;
  const trained = volume.summary.filter((entry) => entry.sets > 0);

  return (
    <Screen>
      <ScreenHeader eyebrow="Progress" title="Training" />
      <ProgressSubNav active="training" />

      <Card>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text variant="label" tone="tertiary">
                Adherence · 4 weeks
              </Text>
              <Text variant="title">{summary.adherencePercent}%</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="label" tone="tertiary">
                Sessions
              </Text>
              <Text variant="title">
                {summary.sessionsCompleted}
                <Text variant="body" tone="tertiary">
                  {' / '}
                  {summary.sessionsPlanned}
                </Text>
              </Text>
            </View>
          </View>

          <BarChart
            bars={weekly.map((week, index) => ({
              label: index === weekly.length - 1 ? 'Now' : `${weekly.length - 1 - index}w`,
              value: week.sessions,
            }))}
            target={plannedPerWeek}
            accessibilityLabel="Completed sessions per week over the last eight weeks"
          />

          <Text variant="caption" tone="secondary">
            {summary.sessionsCompleted === 0
              ? 'No sessions logged in the last four weeks.'
              : `${summary.averagePerWeek} sessions a week on average, against a plan of ${plannedPerWeek}. The dashed line is your target.`}
          </Text>
        </View>
      </Card>

      <View>
        <SectionHeader title="This week's volume" />
        {trained.length === 0 ? (
          <Text variant="caption" tone="tertiary">
            Nothing logged this week yet. Sets are counted with fractional credits, so a bench press
            adds a full set to chest and half a set to triceps and front delts.
          </Text>
        ) : (
          <Card padding="md">
            <View style={{ gap: theme.spacing.md }}>
              {trained.map((entry) => (
                <View key={entry.muscleId} style={{ gap: theme.spacing.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption">{formatMuscle(entry.muscleId)}</Text>
                    <Text
                      variant="mono"
                      tone={
                        entry.status === 'in_range'
                          ? 'success'
                          : entry.status === 'over'
                            ? 'warning'
                            : 'tertiary'
                      }
                    >
                      {entry.sets} / {entry.minSets}–{entry.maxSets}
                    </Text>
                  </View>
                  <ProgressBar
                    value={entry.sets}
                    target={entry.maxSets}
                    height={4}
                    showOvershoot={false}
                  />
                  <Text variant="caption" tone="tertiary">
                    {entry.frequency} {entry.frequency === 1 ? 'session' : 'sessions'} this week
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}
        <Text variant="caption" tone="tertiary" style={{ marginTop: theme.spacing.sm }}>
          Being over the band is not automatically a problem — it is a prompt to check how recovery
          and performance are holding up.
        </Text>
      </View>
    </Screen>
  );
}

function formatMuscle(muscleId: string): string {
  return muscleId.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
