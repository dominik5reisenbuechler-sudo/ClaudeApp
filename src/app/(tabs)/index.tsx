import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/layout';
import { Callout, Card, ErrorState, LoadingState, Text } from '@/components/ui';
import { summarizeSteps } from '@/domain/activity/steps';
import { totalsFor } from '@/domain/nutrition/dailyTotals';
import { GOAL_LABELS } from '@/domain/nutrition/goalAdjustment';
import { buildPendingActions } from '@/domain/progress/pendingActions';
import { summarizeWeight } from '@/domain/progress/weightSummary';
import { CheckinPromptCard } from '@/features/dashboard/CheckinPromptCard';
import { NutritionTargetsCard } from '@/features/dashboard/NutritionTargetsCard';
import { StreaksCard } from '@/features/dashboard/StreaksCard';
import { PendingActionsCard } from '@/features/dashboard/PendingActionsCard';
import { StepsCard } from '@/features/dashboard/StepsCard';
import { WeightCard } from '@/features/dashboard/WeightCard';
import { useAwardPass } from '@/hooks/useGamification';
import { useStepLogs, useWeightLogs } from '@/hooks/useLogs';
import { toLoggedEntries, useFoodEntries } from '@/hooks/useNutrition';
import { useActiveGoal, useActiveTarget, useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/theme/ThemeProvider';
import { todayIsoDate } from '@/utils/date';

/**
 * Home dashboard.
 *
 * Everything rendered here is derived from the user's own rows by pure domain
 * functions — there is no placeholder data in the render path. Where a
 * capability does not exist yet (food logging, the training planner), the
 * corresponding input is `null` and the affected sections say so plainly rather
 * than showing invented numbers.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = todayIsoDate();

  const profile = useProfile();
  const goal = useActiveGoal();
  const target = useActiveTarget();
  const weights = useWeightLogs(undefined, today);
  const steps = useStepLogs(undefined, today);
  const foodEntries = useFoodEntries(today);

  // Awards XP and records achievements for anything logged since the last
  // visit. Idempotent, so mounting the dashboard twice changes nothing.
  useAwardPass();

  const isLoading =
    profile.isLoading ||
    goal.isLoading ||
    target.isLoading ||
    weights.isLoading ||
    steps.isLoading ||
    foodEntries.isLoading;
  const isError =
    profile.isError ||
    goal.isError ||
    target.isError ||
    weights.isError ||
    steps.isError ||
    foodEntries.isError;

  const goalType = goal.data?.goal ?? 'maintenance';
  const stepGoal = target.data?.step_goal ?? 8000;

  const weightSummary = useMemo(
    () => summarizeWeight(weights.data ?? [], goalType, today),
    [weights.data, goalType, today],
  );

  const stepsSummary = useMemo(
    () => summarizeSteps(steps.data ?? [], stepGoal, today),
    [steps.data, stepGoal, today],
  );

  const consumed = useMemo(
    () => totalsFor(toLoggedEntries(foodEntries.data ?? [])),
    [foodEntries.data],
  );

  const pendingActions = useMemo(() => {
    if (!target.data) return [];
    return buildPendingActions({
      today,
      targets: {
        energyKcal: target.data.energy_kcal,
        proteinG: target.data.protein_g,
        stepGoal: target.data.step_goal,
      },
      weightLoggedToday: weightSummary.loggedToday,
      steps: stepsSummary,
      nutrition: { consumedKcal: consumed.energyKcal, consumedProteinG: consumed.proteinG },
      // Null until the training planner exists. See the doc comment on
      // buildPendingActions — null means "unavailable", not "nothing done".
      workout: null,
    });
  }, [target.data, today, weightSummary.loggedToday, stepsSummary, consumed]);

  if (isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load your dashboard just now."
          onRetry={() => {
            void profile.refetch();
            void goal.refetch();
            void target.refetch();
            void weights.refetch();
            void steps.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Today"
        title={profile.data?.display_name ? `Hi, ${profile.data.display_name}` : 'Today'}
        {...(goal.data ? { subtitle: GOAL_LABELS[goal.data.goal] } : {})}
      />

      {target.data ? (
        <>
          <CheckinPromptCard />
          <PendingActionsCard actions={pendingActions} />
          <NutritionTargetsCard
            target={target.data}
            consumed={{
              energyKcal: consumed.energyKcal,
              proteinG: consumed.proteinG,
              carbsG: consumed.carbsG,
              fatG: consumed.fatG,
              fiberG: consumed.fiberG,
            }}
            incompleteNutrients={consumed.incompleteNutrients}
            onPress={() => router.push('/nutrition')}
          />
          <WeightCard summary={weightSummary} />
          <StepsCard summary={stepsSummary} />
          <StreaksCard />

          <Card tone="flat" onPress={() => router.push('/coach')}>
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="label" tone="tertiary">
                Ask the coach
              </Text>
              <Text variant="caption" tone="secondary">
                Questions about your own numbers — am I gaining too fast, is this lift ready for
                more weight. It answers from your logs or says it cannot.
              </Text>
            </View>
          </Card>

          <View style={{ marginTop: theme.spacing.sm }}>
            <Callout tone="info" title="Your targets will change">
              These numbers start from an equation. Once you have two to three weeks of weigh-ins
              and food logs, the weekly check-in replaces that estimate with your measured
              expenditure and adjusts from there — with an explanation every time.
            </Callout>
          </View>
        </>
      ) : (
        <Callout tone="warning" title="No targets yet">
          <Text variant="caption" tone="secondary">
            We could not find an active target for your account. Re-running onboarding from your
            profile will recreate one.
          </Text>
        </Callout>
      )}
    </Screen>
  );
}
