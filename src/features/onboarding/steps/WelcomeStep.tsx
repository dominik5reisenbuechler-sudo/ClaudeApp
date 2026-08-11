import { useState } from 'react';
import { View } from 'react-native';

import { ToggleRow } from '../controls';
import { useOnboardingDraft } from '../draft';
import { StepShell } from '../StepShell';
import { welcomeSchema } from '../schema';
import type { StepScreenProps } from './types';
import { Callout, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const PROMISES = [
  {
    title: 'Targets that adapt',
    body: 'We start with an estimate, then correct it from your real intake and weight trend — not from a formula that never changes.',
  },
  {
    title: 'Training that progresses',
    body: 'Your programme responds to the sets you actually log, how hard they were, and how well you are recovering.',
  },
  {
    title: 'Every recommendation explained',
    body: 'You can always ask why a number changed, and get an answer built from your own data.',
  },
];

export function WelcomeStep({ step, onNext }: StepScreenProps) {
  const theme = useTheme();
  const { draft, update } = useOnboardingDraft();

  const [acceptedTerms, setAcceptedTerms] = useState(draft.acceptedTerms ?? false);
  const [healthDataConsent, setHealthDataConsent] = useState(draft.healthDataConsent ?? false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    const parsed = welcomeSchema.safeParse({ acceptedTerms, healthDataConsent });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please accept both to continue');
      return;
    }
    update({ acceptedTerms: true, healthDataConsent: true });
    onNext();
  };

  return (
    <StepShell
      step={step}
      title="Let's build your plan"
      subtitle="A few questions so your training and nutrition start from your situation, not an average."
      onContinue={handleContinue}
      continueLabel="Get started"
    >
      <View style={{ gap: theme.spacing.md }}>
        {PROMISES.map((promise) => (
          <Card key={promise.title} padding="md">
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="bodyStrong">{promise.title}</Text>
              <Text variant="caption" tone="secondary">
                {promise.body}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      <Callout tone="info" title="This is a fitness app, not medical advice">
        We give general training and nutrition guidance. If you have a medical condition, are
        pregnant, or are recovering from an eating disorder, please talk to a professional before
        following any plan — and tell us on the health screen so we can adjust what we recommend.
      </Callout>

      <View style={{ gap: theme.spacing.xl }}>
        <ToggleRow
          label="I accept the terms of use"
          value={acceptedTerms}
          onChange={setAcceptedTerms}
        />
        <ToggleRow
          label="I consent to storing my health data"
          description="Weight, nutrition and training data are stored against your account only. You can export or delete everything at any time."
          value={healthDataConsent}
          onChange={setHealthDataConsent}
        />
      </View>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </StepShell>
  );
}
