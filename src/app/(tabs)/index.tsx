import { View } from 'react-native';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import { Callout, Card, ErrorState, LoadingState, MacroProgress, StatCard, Text } from '@/components/ui';
import { GOAL_LABELS } from '@/domain/nutrition/goalAdjustment';
import { useActiveGoal, useActiveTarget, useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Home dashboard — Phase 2 in `docs/MVP_PLAN.md`.
 *
 * What is here now is the real, data-backed frame: the user's own goal and
 * targets, read from the database. The consumption figures are shown as zero
 * because food logging does not exist yet, and the screen says so rather than
 * displaying invented numbers. Hard-coding plausible-looking data is explicitly
 * out of bounds (CLAUDE.md §60), and it also hides exactly the work that is
 * left to do.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const profile = useProfile();
  const goal = useActiveGoal();
  const target = useActiveTarget();

  if (profile.isLoading || goal.isLoading || target.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (profile.isError || goal.isError || target.isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load your plan just now."
          onRetry={() => {
            void profile.refetch();
            void goal.refetch();
            void target.refetch();
          }}
        />
      </Screen>
    );
  }

  const activeTarget = target.data;
  const activeGoal = goal.data;

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Today"
        title={profile.data?.display_name ? `Hi, ${profile.data.display_name}` : 'Today'}
        {...(activeGoal ? { subtitle: GOAL_LABELS[activeGoal.goal] } : {})}
      />

      {activeTarget ? (
        <>
          <Card>
            <View style={{ gap: theme.spacing.lg }}>
              <MacroProgress
                kind="energy"
                label="Calories"
                consumed={0}
                target={activeTarget.energy_kcal}
                unit="kcal"
              />
              <MacroProgress
                kind="protein"
                label="Protein"
                consumed={0}
                target={activeTarget.protein_g}
              />
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <StatCard
              label="Step goal"
              value={activeTarget.step_goal.toLocaleString('en-US')}
              detail="Logging arrives in phase 2"
            />
            <StatCard label="Carbs / Fat" value={`${activeTarget.carbs_g} / ${activeTarget.fat_g} g`} />
          </View>

          <View>
            <SectionHeader title="What's next" />
            <Callout tone="info" title="Foundation complete">
              Your profile, goal and daily targets are set and stored. Weight tracking, food
              logging, the workout planner and the adaptive engine come in the following phases —
              see docs/MVP_PLAN.md.
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
