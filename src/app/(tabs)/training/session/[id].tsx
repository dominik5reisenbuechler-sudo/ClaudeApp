import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import { Button, Callout, Card, Chip, ErrorState, LoadingState, Text } from '@/components/ui';
import { ExerciseLogger } from '@/features/training/ExerciseLogger';
import { RestTimer } from '@/features/training/RestTimer';
import {
  useActivePlan,
  useCompleteSession,
  useDeleteSet,
  useExercises,
  useSession,
} from '@/hooks/useTraining';
import { useTheme } from '@/theme/ThemeProvider';

const RPE_CHOICES = [4, 5, 6, 7, 8, 9, 10] as const;

/**
 * The workout logger.
 *
 * One exercise at a time, with previous performance and the progression call
 * in view. The rest timer appears after a logged set and is dismissible —
 * prescriptive enough to be useful, not so prescriptive it gets in the way.
 */
export default function WorkoutSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const session = useSession(id ?? null);
  const plan = useActivePlan();
  const exercises = useExercises();
  const deleteSet = useDeleteSet();
  const complete = useCompleteSession();

  const [activeIndex, setActiveIndex] = useState(0);
  const [rest, setRest] = useState<{ seconds: number; startedAtMs: number } | null>(null);
  const [sessionRpe, setSessionRpe] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const day = useMemo(() => {
    if (!session.data?.workout_day_id || !plan.data) return null;
    return plan.data.days.find((candidate) => candidate.id === session.data?.workout_day_id) ?? null;
  }, [session.data, plan.data]);

  const exerciseById = useMemo(
    () => new Map((exercises.data ?? []).map((exercise) => [exercise.id, exercise])),
    [exercises.data],
  );

  if (session.isLoading || plan.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (session.isError || !session.data) {
    return (
      <Screen>
        <ErrorState
          title="Session not found"
          message="It may have been finished on another device."
          onRetry={() => router.replace('/training')}
        />
      </Screen>
    );
  }

  const prescriptions = day?.exercises ?? [];
  const current = prescriptions[activeIndex];
  const totalSets = session.data.sets.filter((set) => set.set_type !== 'warmup').length;

  const handleFinish = async () => {
    setError(null);
    try {
      await complete.mutateAsync({
        sessionId: session.data?.id as string,
        sessionRpe,
        notes: null,
      });
      router.replace('/training');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not finish the session.');
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={`Finish session · ${totalSets} ${totalSets === 1 ? 'set' : 'sets'}`}
          loading={complete.isPending}
          onPress={() => void handleFinish()}
        />
      }
    >
      <ScreenHeader
        eyebrow="In progress"
        title={session.data.name ?? 'Workout'}
        onBack={() => router.back()}
      />

      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}

      {rest !== null ? (
        <RestTimer
          seconds={rest.seconds}
          startedAtMs={rest.startedAtMs}
          onDismiss={() => setRest(null)}
        />
      ) : null}

      {prescriptions.length === 0 ? (
        <Callout tone="info" title="Free session">
          This session is not tied to a programme day, so there is nothing prescribed. Build a
          programme from the training tab to get targets and progression.
        </Callout>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {prescriptions.map((prescription, index) => {
              const logged = session.data?.sets.filter(
                (set) => set.exercise_id === prescription.exercise_id,
              ).length ?? 0;
              return (
                <Chip
                  key={prescription.id}
                  label={`${index + 1}${logged > 0 ? ` · ${logged}` : ''}`}
                  selected={index === activeIndex}
                  onPress={() => setActiveIndex(index)}
                />
              );
            })}
          </View>

          {current ? (
            <ExerciseLogger
              sessionId={session.data.id}
              prescription={current}
              exerciseName={current.exercise?.name ?? current.exercise_id}
              loadIncrementKg={Number(
                exerciseById.get(current.exercise_id)?.load_increment_kg ?? 2.5,
              )}
              loggedSets={session.data.sets.filter(
                (set) => set.exercise_id === current.exercise_id,
              )}
              onSetLogged={(seconds) => setRest({ seconds, startedAtMs: Date.now() })}
              onRemoveSet={(setId) => void deleteSet.mutateAsync(setId)}
            />
          ) : null}

          {activeIndex < prescriptions.length - 1 ? (
            <Button
              label="Next exercise"
              variant="secondary"
              onPress={() => {
                setActiveIndex((index) => index + 1);
                setRest(null);
              }}
            />
          ) : null}
        </>
      )}

      <Card padding="md">
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="label" tone="tertiary">
            How hard was this session?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {RPE_CHOICES.map((choice) => (
              <Chip
                key={choice}
                label={`${choice}`}
                selected={sessionRpe === choice}
                onPress={() => setSessionRpe(choice)}
              />
            ))}
          </View>
          <Text variant="caption" tone="tertiary">
            Optional. Session difficulty over time helps us spot accumulated fatigue before it
            stalls your progress.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
