import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, ScreenHeader } from '@/components/layout';
import {
  BottomSheet,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
  Text,
} from '@/components/ui';
import { ExerciseCoachingPanel } from '@/features/training/ExerciseCoachingPanel';
import { TrainingSubNav } from '@/features/training/TrainingSubNav';
import { useContributionMap, useExerciseAlternatives, useExercises } from '@/hooks/useTraining';
import { useTheme } from '@/theme/ThemeProvider';
import type { ExerciseRow } from '@/types/database';

/**
 * The exercise database.
 *
 * Each entry shows which muscles it credits and by how much — the fractional
 * model made visible, so a user can see why three sets of bench counts as one
 * and a half sets of triceps.
 */
export default function ExercisesScreen() {
  const theme = useTheme();
  const exercises = useExercises();
  const contributions = useContributionMap();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExerciseRow | null>(null);

  const alternatives = useExerciseAlternatives(selected?.id ?? null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = exercises.data ?? [];
    if (!needle) return rows;
    return rows.filter(
      (exercise) =>
        exercise.name.toLowerCase().includes(needle) ||
        exercise.equipment.toLowerCase().includes(needle),
    );
  }, [exercises.data, query]);

  if (exercises.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (exercises.isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load the exercise database."
          onRetry={() => void exercises.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Training" title="Exercises" />
      <TrainingSubNav active="exercises" />

      <SearchInput value={query} onChangeText={setQuery} placeholder="Search exercises" />

      {filtered.length === 0 ? (
        <EmptyState title="No matches" message="Try a different search." />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {filtered.map((exercise) => (
            <Card key={exercise.id} padding="sm" onPress={() => setSelected(exercise)}>
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="bodyStrong">{exercise.name}</Text>
                <Text variant="caption" tone="tertiary">
                  {formatLabel(exercise.equipment)} · {formatLabel(exercise.movement_pattern)} ·{' '}
                  {exercise.rep_range_min}–{exercise.rep_range_max} reps
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
      >
        {selected ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Text variant="caption" tone="tertiary">
              {formatLabel(selected.equipment)} · {formatLabel(selected.movement_pattern)} ·{' '}
              {selected.rep_range_min}–{selected.rep_range_max} reps · {selected.load_increment_kg} kg
              increments
            </Text>

            <ExerciseCoachingPanel exercise={selected} />

            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="label" tone="tertiary">
                Counts toward
              </Text>
              {(contributions.get(selected.id) ?? []).map((credit) => (
                <View
                  key={credit.muscleId}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text variant="caption">{formatLabel(credit.muscleId)}</Text>
                  <Text variant="mono" tone="secondary">
                    {credit.setCredit} {credit.setCredit === 1 ? 'set' : 'sets'} per set
                  </Text>
                </View>
              ))}
            </View>

            {(alternatives.data ?? []).length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="label" tone="tertiary">
                  Alternatives
                </Text>
                {(alternatives.data ?? []).map((alternative) => (
                  <Text key={alternative.id} variant="caption" tone="secondary">
                    {alternative.name}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
