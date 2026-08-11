import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useOnboardingDraft } from '../draft';
import { StepShell } from '../StepShell';
import { completeOnboarding } from '../submit';
import { canComputeTargets, draftToTargetInput } from '../targetInput';
import type { StepScreenProps } from './types';
import { Callout, Card, MacroProgress, StatCard, Text } from '@/components/ui';
import { computeInitialTargets } from '@/domain/nutrition/targets';
import { GOAL_LABELS } from '@/domain/nutrition/goalAdjustment';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The payoff screen: the user's own numbers, with the derivation visible.
 *
 * Targets are computed here, in the UI, from the domain function — and they are
 * computed again inside `completeOnboarding` before the write. That is
 * deliberate rather than wasteful: the function is pure and deterministic, so
 * both calls agree, and the write does not depend on a value passed down
 * through component state that could have gone stale.
 */
export function ReviewStep({ step, onBack }: StepScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { draft, clear } = useOnboardingDraft();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(() => {
    if (!canComputeTargets(draft)) return null;
    return computeInitialTargets(draftToTargetInput(draft));
  }, [draft]);

  if (!targets) {
    return (
      <StepShell
        step={step}
        title="Almost there"
        subtitle="Some answers are still missing, so we cannot work out your targets yet."
        onContinue={() => onBack?.()}
        continueLabel="Go back"
        {...(onBack ? { onBack } : {})}
      >
        <Callout tone="warning">
          Please go back and complete the earlier steps. We would rather ask again than show you a
          calorie target built on assumptions.
        </Callout>
      </StepShell>
    );
  }

  const handleFinish = async () => {
    if (!user) {
      setError('You are not signed in. Please sign in and try again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await completeOnboarding(user.id, draft);
      await clear();
      // The router gates on the profile, so it must be re-read before we leave.
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { macros, tdee, bmr } = targets;

  return (
    <StepShell
      step={step}
      title="Your starting plan"
      subtitle={`${GOAL_LABELS[targets.resolvedGoal]} — here is where we are beginning, and why.`}
      onContinue={() => void handleFinish()}
      continueLabel="Start training"
      isSubmitting={isSubmitting}
      {...(onBack ? { onBack } : {})}
    >
      {targets.safetyFlags.length > 0 ? (
        <Callout
          tone={targets.resolvedGoal !== targets.requestedGoal ? 'warning' : 'info'}
          title="Please read this first"
        >
          {targets.safetyFlags.map((flag) => flag.message).join('\n\n')}
        </Callout>
      ) : null}

      <Card>
        <View style={{ gap: theme.spacing.xl }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="label" tone="tertiary">
              Daily calories
            </Text>
            <Text variant="hero">{targets.energyKcal.toLocaleString('en-US')}</Text>
            <Text variant="caption" tone="secondary">
              kcal per day
            </Text>
          </View>

          <View style={{ gap: theme.spacing.lg }}>
            <MacroProgress
              kind="protein"
              label="Protein"
              consumed={0}
              target={macros.proteinG}
              showRemaining={false}
            />
            <MacroProgress
              kind="carbs"
              label="Carbohydrate"
              consumed={0}
              target={macros.carbsG}
              showRemaining={false}
            />
            <MacroProgress
              kind="fat"
              label="Fat"
              consumed={0}
              target={macros.fatG}
              showRemaining={false}
            />
            <MacroProgress
              kind="fiber"
              label="Fibre"
              consumed={0}
              target={macros.fiberG}
              showRemaining={false}
            />
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <StatCard label="Est. expenditure" value={`${tdee.tdeeKcal}`} detail="kcal/day estimate" />
        <StatCard label="Step goal" value={targets.stepGoal.toLocaleString('en-US')} />
      </View>

      <Card tone="flat" padding="none">
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="label" tone="tertiary">
            Why these numbers?
          </Text>
          <Text variant="caption" tone="secondary">
            {targets.explanation}
          </Text>
        </View>
      </Card>

      <Callout tone="info" title="This is a starting estimate, not a measurement">
        Your resting rate was estimated at {Math.round(bmr.bmrKcal)} kcal from an equation, and
        equations are roughly ±10% wrong for any individual. Log your weight and food for two to
        three weeks and we will replace the estimate with what your body is actually doing.
      </Callout>

      {error ? (
        <Callout tone="danger" title="We could not save your plan">
          {error}
        </Callout>
      ) : null}
    </StepShell>
  );
}
