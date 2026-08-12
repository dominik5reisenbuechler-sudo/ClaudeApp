import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import { Button, Callout, Card, Input, LoadingState, Text } from '@/components/ui';
import { RecommendationCard } from '@/features/checkin/RecommendationCard';
import { ScaleField } from '@/features/checkin/ScaleField';
import { TdeeCard } from '@/features/checkin/TdeeCard';
import { ProgressSubNav } from '@/features/progress/ProgressSubNav';
import {
  currentCheckinWeek,
  useCheckin,
  usePendingRecommendations,
  useRespondToRecommendation,
  useSubmitCheckin,
  useWeeklyReview,
} from '@/hooks/useCheckin';
import { useTheme } from '@/theme/ThemeProvider';
import type { RecommendationRow } from '@/types/database';
import { addDays } from '@/utils/date';

interface Answers {
  trainingPerformance: number | null;
  hunger: number | null;
  energy: number | null;
  sleepQuality: number | null;
  stress: number | null;
  dietAdherence: number | null;
  trainingSatisfaction: number | null;
  jointDiscomfort: number | null;
}

const EMPTY: Answers = {
  trainingPerformance: null,
  hunger: null,
  energy: null,
  sleepQuality: null,
  stress: null,
  dietAdherence: null,
  trainingSatisfaction: null,
  jointDiscomfort: null,
};

/**
 * The weekly check-in — where the feedback loop closes.
 *
 * The recommendations update live as the answers come in, and nothing is
 * written until the user submits. Seeing the reasoning change while answering
 * is the point: it makes clear that the app is reading their week rather than
 * running a script.
 */
export default function CheckinScreen() {
  const theme = useTheme();
  const weekStart = currentCheckinWeek();
  const weekEnd = addDays(weekStart, 6);

  const existing = useCheckin(weekStart);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = useSubmitCheckin();
  const pending = usePendingRecommendations();
  const respond = useRespondToRecommendation();

  const recoveryAnswers = useMemo(
    () => ({
      trainingPerformance: answers.trainingPerformance,
      sleepQuality: answers.sleepQuality,
      energy: answers.energy,
      stress: answers.stress,
      jointDiscomfort: answers.jointDiscomfort,
    }),
    [answers],
  );

  const review = useWeeklyReview(weekStart, recoveryAnswers);

  const set = (key: keyof Answers) => (value: number | null) =>
    setAnswers((current) => ({ ...current, [key]: value }));

  const alreadyDone = existing.data !== null && existing.data !== undefined && !submitted;

  if (existing.isLoading) {
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
        title="Weekly check-in"
        subtitle={`Reviewing ${formatRange(weekStart, weekEnd)}`}
      />
      <ProgressSubNav active="checkin" />

      <TdeeCard estimate={review.estimate} />

      {alreadyDone ? (
        <Callout tone="success" title="Already checked in">
          You have completed this week&apos;s check-in. Your answers are saved and any
          recommendations are below — you can still change your mind about them.
        </Callout>
      ) : (
        <>
          <View>
            <SectionHeader title="How was the week?" />
            <Card>
              <View style={{ gap: theme.spacing.xl }}>
                <ScaleField
                  label="Training performance"
                  lowLabel="Much worse than usual"
                  highLabel="Best sessions in a while"
                  value={answers.trainingPerformance}
                  onChange={set('trainingPerformance')}
                />
                <ScaleField
                  label="Energy"
                  lowLabel="Flat all week"
                  highLabel="Plenty"
                  value={answers.energy}
                  onChange={set('energy')}
                />
                <ScaleField
                  label="Sleep quality"
                  lowLabel="Poor"
                  highLabel="Excellent"
                  value={answers.sleepQuality}
                  onChange={set('sleepQuality')}
                />
                <ScaleField
                  label="Stress"
                  lowLabel="Very low"
                  highLabel="Very high"
                  value={answers.stress}
                  onChange={set('stress')}
                />
                <ScaleField
                  label="Hunger"
                  lowLabel="Never hungry"
                  highLabel="Hungry constantly"
                  value={answers.hunger}
                  onChange={set('hunger')}
                />
                <ScaleField
                  label="Sticking to the plan"
                  lowLabel="Barely"
                  highLabel="Almost every day"
                  value={answers.dietAdherence}
                  onChange={set('dietAdherence')}
                />
                <ScaleField
                  label="Happy with your training"
                  lowLabel="Not at all"
                  highLabel="Very"
                  value={answers.trainingSatisfaction}
                  onChange={set('trainingSatisfaction')}
                />
                <ScaleField
                  label="Joint discomfort"
                  lowLabel="None"
                  highLabel="Constant"
                  value={answers.jointDiscomfort}
                  onChange={set('jointDiscomfort')}
                  min={0}
                  max={4}
                />

                <Input
                  label="Anything else?"
                  placeholder="Travel, illness, a rough week — context we cannot measure"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                <Text variant="caption" tone="tertiary">
                  Skip anything you are not sure about. A skipped answer is left out of the
                  reasoning rather than treated as a middling 3.
                </Text>
              </View>
            </Card>
          </View>

          <Button
            label="Save check-in"
            loading={submit.isPending}
            onPress={() => {
              submit.mutate(
                {
                  weekStartDate: weekStart,
                  answers: { ...answers, notes: notes.trim() === '' ? null : notes.trim() },
                  computed: review.computed,
                  recommendations: review.recommendations,
                },
                { onSuccess: () => setSubmitted(true) },
              );
            }}
          />
        </>
      )}

      <View>
        <SectionHeader title={alreadyDone || submitted ? 'This week' : 'What we would suggest'} />
        {review.isLoading ? (
          <LoadingState label="Reading your week…" />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            {(alreadyDone || submitted ? pendingCards(pending.data) : review.recommendations).map(
              (item, index) =>
                'id' in item ? (
                  <RecommendationCard
                    key={item.id}
                    recommendation={toRecommendation(item)}
                    isResponding={respond.isPending}
                    onAccept={() => respond.mutate({ recommendation: item, status: 'accepted' })}
                    onReject={() => respond.mutate({ recommendation: item, status: 'rejected' })}
                  />
                ) : (
                  <RecommendationCard key={`${item.type}-${index}`} recommendation={item} />
                ),
            )}
          </View>
        )}
      </View>

      <Text variant="caption" tone="tertiary">
        Nothing here changes on its own. A recommendation is a proposal — your targets only move
        when you accept one.
      </Text>
    </Screen>
  );
}

function pendingCards(rows: readonly RecommendationRow[] | undefined): RecommendationRow[] {
  return [...(rows ?? [])];
}

function toRecommendation(row: RecommendationRow) {
  return {
    type: row.type,
    currentValue: (row.current_value ?? {}) as Record<string, unknown>,
    suggestedValue: (row.suggested_value ?? {}) as Record<string, unknown>,
    reason: row.reason,
    confidence: Number(row.confidence),
    evidenceRuleIds: row.evidence_rule_ids,
  };
}

function formatRange(from: string, to: string): string {
  const format = (date: string): string => {
    const [, month, day] = date.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''}`;
  };
  return `${format(from)} – ${format(to)}`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
