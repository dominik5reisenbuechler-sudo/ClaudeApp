import { useState } from 'react';
import { View } from 'react-native';

import { LogValueSheet } from './LogValueSheet';
import { Button, Card, ProgressBar, Text } from '@/components/ui';
import type { StepsSummary } from '@/domain/activity/steps';
import { useLogSteps } from '@/hooks/useLogs';
import { useTheme } from '@/theme/ThemeProvider';

interface StepsCardProps {
  summary: StepsSummary;
}

export function StepsCard({ summary }: StepsCardProps) {
  const theme = useTheme();
  const [isLogging, setIsLogging] = useState(false);
  const logSteps = useLogSteps();

  const format = (value: number) => value.toLocaleString('en-US');

  return (
    <>
      <Card>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="label" tone="tertiary">
              Steps
            </Text>
            <Text variant="mono">
              {summary.todaySteps === null ? '—' : format(summary.todaySteps)}
              <Text variant="mono" tone="tertiary">
                {' / '}
                {format(summary.goal)}
              </Text>
            </Text>
          </View>

          <ProgressBar
            value={summary.todaySteps ?? 0}
            target={summary.goal}
            accessibilityLabel={`Steps: ${format(summary.todaySteps ?? 0)} of ${format(summary.goal)}`}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" tone="tertiary">
              {summary.averageDailySteps === null
                ? 'No steps logged yet'
                : `${format(summary.averageDailySteps)} daily average`}
            </Text>
            <Text variant="caption" tone="tertiary">
              {summary.daysLogged === 0
                ? ''
                : `Goal met ${summary.daysGoalMet}/${summary.daysLogged} days`}
            </Text>
          </View>

          <Button
            label={summary.todaySteps === null ? "Log today's steps" : "Update today's steps"}
            variant="secondary"
            size="sm"
            onPress={() => setIsLogging(true)}
          />
        </View>
      </Card>

      <LogValueSheet
        visible={isLogging}
        onClose={() => setIsLogging(false)}
        title="Log your steps"
        label="Steps today"
        suffix="steps"
        precision={0}
        min={0}
        max={200000}
        initialValue={summary.todaySteps}
        hint="Your phone's health app usually has this figure. Health integrations arrive in a later phase."
        onSave={async (steps) => {
          await logSteps.mutateAsync({ steps });
        }}
      />
    </>
  );
}
