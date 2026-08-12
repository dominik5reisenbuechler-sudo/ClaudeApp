import { View } from 'react-native';

import { Screen, ScreenHeader } from '@/components/layout';
import { Card, EmptyState, ErrorState, LoadingState, Text } from '@/components/ui';
import { totalWorkingSets, sessionTonnage } from '@/domain/training/volume';
import { TrainingSubNav } from '@/features/training/TrainingSubNav';
import { useSessionHistory } from '@/hooks/useTraining';
import { toPerformedSets } from '@/services/trainingService';
import { useTheme } from '@/theme/ThemeProvider';
import type { FullSession } from '@/services/trainingService';

export default function TrainingHistoryScreen() {
  const theme = useTheme();
  const history = useSessionHistory();

  if (history.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (history.isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load your training history."
          onRetry={() => void history.refetch()}
        />
      </Screen>
    );
  }

  const sessions = history.data ?? [];

  return (
    <Screen>
      <ScreenHeader eyebrow="Training" title="History" />
      <TrainingSubNav active="history" />

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          message="Finished workouts show up here, with the sets and volume you logged."
        />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function SessionCard({ session }: { session: FullSession }) {
  const theme = useTheme();

  const performed = toPerformedSets([session]);
  const workingSets = totalWorkingSets(performed);
  const tonnage = sessionTonnage(
    performed.map((set, index) => ({
      ...set,
      weightKg: session.sets[index]?.weight_kg === undefined
        ? null
        : Number(session.sets[index]?.weight_kg ?? 0),
    })),
  );

  const exerciseCount = new Set(session.sets.map((set) => set.exercise_id)).size;

  return (
    <Card padding="md">
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="bodyStrong">{session.name ?? 'Workout'}</Text>
          <Text variant="caption" tone="tertiary">
            {formatDate(session.started_at)}
          </Text>
        </View>

        <Text variant="caption" tone="secondary">
          {workingSets} working {workingSets === 1 ? 'set' : 'sets'} across {exerciseCount}{' '}
          {exerciseCount === 1 ? 'exercise' : 'exercises'}
          {tonnage > 0 ? ` · ${Math.round(tonnage).toLocaleString('en-US')} kg total` : ''}
        </Text>

        {session.session_rpe !== null ? (
          <Text variant="caption" tone="tertiary">
            Session difficulty {session.session_rpe}/10
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
