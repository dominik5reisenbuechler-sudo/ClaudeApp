import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Callout, Card, Chip, NumberInput, Text } from '@/components/ui';
import { computeProgression } from '@/domain/training/progression';
import { useLogSet, useRecentSetsForExercise } from '@/hooks/useTraining';
import { toLoggedSets } from '@/services/trainingService';
import { useTheme } from '@/theme/ThemeProvider';
import type { ExerciseSetRow, WorkoutExerciseRow } from '@/types/database';

interface ExerciseLoggerProps {
  sessionId: string;
  prescription: WorkoutExerciseRow;
  exerciseName: string;
  loadIncrementKg: number;
  /** Sets already logged for this exercise in the current session. */
  loggedSets: ExerciseSetRow[];
  onSetLogged: (restSeconds: number) => void;
  onRemoveSet: (setId: string) => void;
}

const RIR_CHOICES = [0, 1, 2, 3, 4] as const;

/**
 * Logging one exercise.
 *
 * Shows previous performance and the progression call above the input, because
 * "80 kg × 10, 80 × 9, 80 × 8 — add reps, your lowest set was 8" is what turns
 * a logger into a coach. The recommendation and its reason both come from
 * `computeProgression`; nothing here decides anything itself.
 */
export function ExerciseLogger({
  sessionId,
  prescription,
  exerciseName,
  loadIncrementKg,
  loggedSets,
  onSetLogged,
  onRemoveSet,
}: ExerciseLoggerProps) {
  const theme = useTheme();
  const history = useRecentSetsForExercise(prescription.exercise_id);
  const logSet = useLogSet();

  const recommendation = useMemo(() => {
    const sessions = history.data ?? [];
    const last = sessions[0];
    if (!last) return null;

    return computeProgression({
      targetRepMin: prescription.target_rep_min,
      targetRepMax: prescription.target_rep_max,
      targetRir: prescription.target_rir,
      loadIncrementKg,
      lastSession: toLoggedSets(last.sets),
      previousSessions: sessions.slice(1).map((session) => toLoggedSets(session.sets)),
    });
  }, [history.data, prescription, loadIncrementKg]);

  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(null);
  const [rir, setRir] = useState<number>(prescription.target_rir);
  const [techniqueBreakdown, setTechniqueBreakdown] = useState(false);
  const [painReported, setPainReported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the recommendation, then from the last set logged today.
  const suggestedWeight =
    loggedSets.length > 0
      ? Number(loggedSets[loggedSets.length - 1]?.weight_kg ?? 0) || null
      : (recommendation?.nextWeightKg ?? null);

  const effectiveWeight = weightKg ?? suggestedWeight;

  const handleLog = async () => {
    if (effectiveWeight === null || reps === null || reps <= 0) {
      setError('Enter the weight and reps you did');
      return;
    }

    setError(null);
    try {
      await logSet.mutateAsync({
        sessionId,
        exerciseId: prescription.exercise_id,
        setIndex: loggedSets.length,
        weightKg: effectiveWeight,
        reps,
        rir,
        techniqueBreakdown,
        painReported,
      });
      setWeightKg(effectiveWeight);
      setReps(null);
      setTechniqueBreakdown(false);
      setPainReported(false);
      onSetLogged(prescription.rest_seconds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that set.');
    }
  };

  const lastSession = history.data?.[0];

  return (
    <Card>
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="heading">{exerciseName}</Text>
          <Text variant="caption" tone="tertiary">
            {prescription.target_sets} sets · {prescription.target_rep_min}–
            {prescription.target_rep_max} reps · {prescription.target_rir} RIR
          </Text>
        </View>

        {lastSession ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="label" tone="tertiary">
              Previous
            </Text>
            {lastSession.sets
              .filter((set) => set.set_type !== 'warmup')
              .map((set) => (
                <Text key={set.id} variant="caption" tone="secondary">
                  {formatWeight(set.weight_kg)} kg × {set.reps ?? '—'}
                  {set.rir !== null ? `  ·  ${set.rir} RIR` : ''}
                </Text>
              ))}
          </View>
        ) : null}

        {recommendation ? (
          <Callout tone={recommendation.blockedBy ? 'warning' : 'info'}>
            {recommendation.reason}
          </Callout>
        ) : null}

        {loggedSets.length > 0 ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="label" tone="tertiary">
              Today
            </Text>
            {loggedSets.map((set, index) => (
              <View
                key={set.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
              >
                <Text variant="caption" tone="tertiary" style={{ width: 24 }}>
                  {index + 1}
                </Text>
                <Text variant="body" style={{ flex: 1 }}>
                  {formatWeight(set.weight_kg)} kg × {set.reps ?? '—'}
                  {set.rir !== null ? `  ·  ${set.rir} RIR` : ''}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove set ${index + 1}`}
                  hitSlop={8}
                  onPress={() => onRemoveSet(set.id)}
                >
                  <Text variant="body" tone="tertiary">
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <NumberInput
            label="Weight"
            suffix="kg"
            value={effectiveWeight}
            onChangeValue={(value) => {
              setWeightKg(value);
              setError(null);
            }}
            containerStyle={{ flex: 1 }}
          />
          <NumberInput
            label="Reps"
            precision={0}
            value={reps}
            onChangeValue={(value) => {
              setReps(value);
              setError(null);
            }}
            containerStyle={{ flex: 1 }}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" tone="secondary">
            Reps left in the tank
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {RIR_CHOICES.map((choice) => (
              <Chip
                key={choice}
                label={`${choice}`}
                selected={rir === choice}
                onPress={() => setRir(choice)}
              />
            ))}
          </View>
          <Text variant="caption" tone="tertiary">
            {RIR_EXPLANATIONS[rir] ?? ''}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Chip
            label="Form broke down"
            selected={techniqueBreakdown}
            onPress={() => setTechniqueBreakdown((current) => !current)}
          />
          <Chip
            label="Pain"
            selected={painReported}
            onPress={() => setPainReported((current) => !current)}
          />
        </View>

        {painReported ? (
          <Callout tone="warning">
            We will not add load to this exercise next time. If the pain persists, swap the movement
            and speak to someone qualified.
          </Callout>
        ) : null}

        {error ? (
          <Callout tone="danger">
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          </Callout>
        ) : null}

        <Button
          label={`Log set ${loggedSets.length + 1}`}
          loading={logSet.isPending}
          onPress={() => void handleLog()}
        />
      </View>
    </Card>
  );
}

/** Plain-language RIR, as promised in CLAUDE.md §34. */
const RIR_EXPLANATIONS: Record<number, string> = {
  0: 'No further clean rep was possible.',
  1: 'About one clean rep left.',
  2: 'About two clean reps left — the usual target.',
  3: 'About three clean reps left.',
  4: 'Comfortably short of failure.',
};

function formatWeight(value: number | null): string {
  if (value === null) return '—';
  const numeric = Number(value);
  return Number.isInteger(numeric) ? `${numeric}` : `${Math.round(numeric * 100) / 100}`;
}
