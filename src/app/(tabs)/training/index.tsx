import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import {
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  Text,
} from '@/components/ui';
import { TrainingSubNav } from '@/features/training/TrainingSubNav';
import {
  useActivePlan,
  useActiveSession,
  useGenerateTrainingPlan,
  useStartSession,
  useWeeklyVolume,
} from '@/hooks/useTraining';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Current plan.
 *
 * Shows the programme, this week's fractional volume per muscle, and the way
 * into a session. Volume is the honest number: a bench press credits chest
 * fully and triceps partially, so what is shown is what was actually trained.
 */
export default function TrainingPlanScreen() {
  const theme = useTheme();
  const router = useRouter();

  const plan = useActivePlan();
  const activeSession = useActiveSession();
  const generate = useGenerateTrainingPlan();
  const startSession = useStartSession();
  const volume = useWeeklyVolume();

  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    try {
      const generated = await generate.mutateAsync();
      setWarnings(generated.warnings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build a programme.');
    }
  };

  const handleStart = async (workoutDayId: string, name: string) => {
    try {
      const session = await startSession.mutateAsync({ workoutDayId, name });
      router.push(`/training/session/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the session.');
    }
  };

  if (plan.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (plan.isError) {
    return (
      <Screen>
        <ErrorState message="We could not load your programme." onRetry={() => void plan.refetch()} />
      </Screen>
    );
  }

  const trained = volume.summary.filter((entry) => entry.sets > 0);

  return (
    <Screen>
      <ScreenHeader eyebrow="Training" title={plan.data?.name ?? 'Training'} />
      <TrainingSubNav active="plan" />

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      {activeSession.data ? (
        <Card tone="accent" onPress={() => router.push(`/training/session/${activeSession.data?.id}`)}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="bodyStrong" tone="accent">
              Session in progress
            </Text>
            <Text variant="caption" tone="secondary">
              {activeSession.data.name ?? 'Workout'} — tap to carry on.
            </Text>
          </View>
        </Card>
      ) : null}

      {warnings.length > 0 ? (
        <Callout tone="warning" title="Worth knowing about this programme">
          {warnings.join('\n\n')}
        </Callout>
      ) : null}

      {!plan.data ? (
        <EmptyState
          title="No programme yet"
          message="We will build one from your training days, session length, equipment and muscle priorities."
          actionLabel={generate.isReady ? 'Build my programme' : 'Loading exercises…'}
          onAction={() => void handleGenerate()}
        />
      ) : (
        <>
          <Text variant="caption" tone="tertiary">
            {plan.data.days_per_week} days per week · {formatStructure(plan.data.structure)}
          </Text>

          <View style={{ gap: theme.spacing.md }}>
            {plan.data.days.map((day) => (
              <Card key={day.id} padding="md">
                <View style={{ gap: theme.spacing.md }}>
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Text variant="bodyStrong">{day.name}</Text>
                    <Button
                      label="Start"
                      size="sm"
                      fullWidth={false}
                      onPress={() => void handleStart(day.id, day.name)}
                    />
                  </View>

                  <View style={{ gap: theme.spacing.xs }}>
                    {day.exercises.map((entry) => (
                      <View
                        key={entry.id}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}
                      >
                        <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                          {entry.exercise?.name ?? entry.exercise_id}
                        </Text>
                        <Text variant="caption" tone="tertiary">
                          {entry.target_sets} × {entry.target_rep_min}–{entry.target_rep_max} @ {entry.target_rir} RIR
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Card>
            ))}
          </View>

          <Button
            label="Rebuild programme"
            variant="secondary"
            loading={generate.isPending}
            onPress={() => void handleGenerate()}
          />
        </>
      )}

      <View>
        <SectionHeader title="This week's volume" />
        {volume.isLoading ? (
          <LoadingState />
        ) : trained.length === 0 ? (
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
                </View>
              ))}
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}

function formatStructure(structure: string): string {
  return structure.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMuscle(muscleId: string): string {
  return muscleId.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
