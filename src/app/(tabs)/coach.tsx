import { useState } from 'react';
import { View } from 'react-native';

import { Screen, ScreenHeader } from '@/components/layout';
import { Button, Callout, Card, Chip, Input, LoadingState, Text } from '@/components/ui';
import { describeAction, requiresConfirmation } from '@/domain/coach/actions';
import type { CoachAction } from '@/domain/coach/actions';
import { useCoach, usePerformCoachAction } from '@/hooks/useCoach';
import type { CoachMessage } from '@/hooks/useCoach';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The AI coach.
 *
 * Every suggestion that would change something arrives as a button the user
 * has to press. Nothing the coach says takes effect on its own — see
 * `domain/coach/actions.ts` for why that is a boundary and not a courtesy.
 *
 * The starter questions are not decoration: an empty chat box invites "how do I
 * get abs", which the coach cannot answer from anyone's data. Questions phrased
 * around the user's own numbers show what it is actually for.
 */

const STARTERS = [
  'Am I gaining too fast?',
  'Should I add weight to my bench press?',
  'How much protein am I actually eating?',
  'Is my training volume where it should be?',
];

export default function CoachScreen() {
  const theme = useTheme();
  const { messages, isAsking, error, isConfigured, isContextReady, ask, reset } = useCoach();
  const [draft, setDraft] = useState('');

  const send = (question: string) => {
    setDraft('');
    void ask(question);
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Coach"
        title="Ask about your data"
        subtitle="Answers come from your own logs, or not at all"
        {...(messages.length > 0 ? { trailing: <Button label="Clear" variant="ghost" size="sm" fullWidth={false} onPress={reset} /> } : {})}
      />

      {!isConfigured ? (
        <Callout tone="info" title="The coach is not switched on">
          This build has no coach configured. Everything else in the app works without it — the
          weekly check-in gives you the same adjustments, with its reasoning shown in full.
        </Callout>
      ) : null}

      {messages.length === 0 ? (
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="caption" tone="secondary">
              The coach reads a summary of your last four weeks — targets, intake, weight trend and
              recent lifts. It has no access to anything else, and when your logs do not answer a
              question it will say so rather than guess.
            </Text>

            <View style={{ gap: theme.spacing.sm }}>
              {STARTERS.map((starter) => (
                <Chip
                  key={starter}
                  label={starter}
                  onPress={() => (isContextReady ? send(starter) : undefined)}
                />
              ))}
            </View>
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.lg }}>
        {messages.map((message, index) => (
          <MessageBubble key={`${message.role}-${index}`} message={message} />
        ))}
      </View>

      {isAsking ? <LoadingState label="Reading your data…" /> : null}

      {error ? (
        <Callout tone="warning">
          <Text variant="caption" tone="secondary">
            {error}
          </Text>
        </Callout>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <Input
          label="Your question"
          placeholder="Ask about your weight, your food or your training"
          value={draft}
          onChangeText={setDraft}
          multiline
          editable={isConfigured && isContextReady}
        />
        <Button
          label={isContextReady ? 'Ask' : 'Loading your data…'}
          loading={isAsking}
          disabled={!isConfigured || !isContextReady || draft.trim() === ''}
          onPress={() => send(draft)}
        />
      </View>

      <Text variant="caption" tone="tertiary">
        The coach is not a medical professional and cannot see anything you have not logged. Nothing
        it suggests changes until you tap to confirm it.
      </Text>
    </Screen>
  );
}

function MessageBubble({ message }: { message: CoachMessage }) {
  const theme = useTheme();
  const isUser = message.role === 'user';

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Card tone={isUser ? 'flat' : 'raised'}>
        <Text variant="caption" tone="tertiary">
          {isUser ? 'You' : 'Coach'}
        </Text>
        <Text variant="body" tone={isUser ? 'secondary' : 'primary'}>
          {message.content}
        </Text>
      </Card>

      {(message.actions ?? []).map((action, index) => (
        <ActionCard key={`${action.type}-${index}`} action={action} />
      ))}
    </View>
  );
}

function ActionCard({ action }: { action: CoachAction }) {
  const theme = useTheme();
  const perform = usePerformCoachAction();
  const [done, setDone] = useState(false);
  const described = describeAction(action);

  if (done) {
    return (
      <Callout tone="success">
        <Text variant="caption" tone="secondary">
          {described.title} — done.
        </Text>
      </Callout>
    );
  }

  return (
    <Card tone="accent">
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="caption">{described.title}</Text>
        {described.detail !== '' ? (
          <Text variant="caption" tone="tertiary">
            {described.detail}
          </Text>
        ) : null}

        <Button
          label={requiresConfirmation(action) ? 'Confirm' : described.title}
          size="sm"
          loading={perform.isPending}
          onPress={() => {
            perform.mutate(action, {
              onSuccess: () => setDone(requiresConfirmation(action)),
            });
          }}
        />
      </View>
    </Card>
  );
}
