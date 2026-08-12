import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import {
  Callout,
  Card,
  Chip,
  EmptyState,
  LineChart,
  LoadingState,
  Text,
} from '@/components/ui';
import { describeRecord, PR_KIND_LABELS } from '@/domain/progress/personalRecords';
import { ProgressSubNav } from '@/features/progress/ProgressSubNav';
import { usePersonalRecords, useStrengthProgress } from '@/hooks/useProgress';
import { useExercises } from '@/hooks/useTraining';
import { useTheme } from '@/theme/ThemeProvider';
import { daysBetween } from '@/utils/date';

/**
 * Strength progression and personal records.
 *
 * The chart plots estimated 1RM so sessions at different rep ranges are
 * comparable — and the screen says out loud that it is an estimate, not a
 * tested max, and that it says nothing about muscle size (CLAUDE.md §45).
 */
export default function StrengthProgressScreen() {
  const theme = useTheme();
  const strength = useStrengthProgress();
  const records = usePersonalRecords();
  const exercises = useExercises();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nameById = useMemo(
    () => new Map((exercises.data ?? []).map((exercise) => [exercise.id, exercise.name])),
    [exercises.data],
  );

  const activeId = selectedId ?? strength.exercises[0] ?? null;
  const trend = useMemo(
    () => (activeId ? strength.trendFor(activeId) : null),
    [activeId, strength],
  );

  const chart = useMemo(() => {
    if (!trend || trend.points.length === 0) return null;
    const first = trend.points[0]?.date as string;
    return {
      points: trend.points.map((point) => ({
        x: daysBetween(first, point.date),
        y: point.estimatedOneRm,
      })),
      first,
      last: trend.points[trend.points.length - 1]?.date as string,
    };
  }, [trend]);

  if (strength.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Progress" title="Strength" />
      <ProgressSubNav active="strength" />

      {strength.exercises.length === 0 ? (
        <EmptyState
          title="Nothing to chart yet"
          message="Log an exercise across two or more sessions and its progression will appear here."
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {strength.exercises.slice(0, 8).map((exerciseId) => (
              <Chip
                key={exerciseId}
                label={nameById.get(exerciseId) ?? exerciseId}
                selected={exerciseId === activeId}
                onPress={() => setSelectedId(exerciseId)}
              />
            ))}
          </View>

          <Card>
            <View style={{ gap: theme.spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text variant="label" tone="tertiary">
                    Estimated max
                  </Text>
                  <Text variant="title">
                    {trend?.latest ? `${trend.latest.estimatedOneRm} kg` : '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="label" tone="tertiary">
                    Trend
                  </Text>
                  <Text
                    variant="title"
                    tone={
                      trend?.kgPerWeek === null || trend?.kgPerWeek === undefined
                        ? 'tertiary'
                        : trend.kgPerWeek >= 0
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {trend?.kgPerWeek === null || trend?.kgPerWeek === undefined
                      ? '—'
                      : `${trend.kgPerWeek > 0 ? '+' : ''}${trend.kgPerWeek} kg/wk`}
                  </Text>
                </View>
              </View>

              {chart ? (
                <LineChart
                  series={[{ points: chart.points, color: theme.colors.accent }]}
                  formatY={(value) => `${Math.round(value)}`}
                  xLabels={{ start: formatShort(chart.first), end: formatShort(chart.last) }}
                  accessibilityLabel="Estimated one-rep max over time"
                />
              ) : null}

              {trend?.latest ? (
                <Text variant="caption" tone="secondary">
                  Best recent set: {trend.latest.weightKg} kg × {trend.latest.reps}.
                  {trend.totalChangeKg !== null && trend.totalChangeKg !== 0
                    ? ` That is ${trend.totalChangeKg > 0 ? 'up' : 'down'} ${Math.abs(trend.totalChangeKg)} kg since you started logging it.`
                    : ''}
                </Text>
              ) : null}
            </View>
          </Card>

          <Callout tone="info">
            These are estimates from your working sets, not tested maxes — and they say nothing
            about muscle size, only about what you lifted.
          </Callout>
        </>
      )}

      <View>
        <SectionHeader title="Personal records" />
        {records.isLoading ? (
          <LoadingState />
        ) : (records.data ?? []).length === 0 ? (
          <Text variant="caption" tone="tertiary">
            Records appear here as you set them. Warm-ups never count, and matching a previous best
            is not a new record.
          </Text>
        ) : (
          <Card padding="md">
            <View style={{ gap: theme.spacing.md }}>
              {(records.data ?? []).slice(0, 12).map((record) => (
                <View key={record.id} style={{ gap: theme.spacing.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                      {nameById.get(record.exercise_id) ?? record.exercise_id}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {record.achieved_on}
                    </Text>
                  </View>
                  <Text variant="caption" tone="secondary">
                    {PR_KIND_LABELS[record.kind]} ·{' '}
                    {describeRecord({
                      exerciseId: record.exercise_id,
                      kind: record.kind,
                      value: Number(record.value),
                      reps: record.reps,
                      weightKg: record.weight_kg === null ? null : Number(record.weight_kg),
                      achievedOn: record.achieved_on,
                      exerciseSetId: record.exercise_set_id,
                      previousValue: null,
                    })}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}

function formatShort(date: string): string {
  return date.slice(5).replace('-', '/');
}
