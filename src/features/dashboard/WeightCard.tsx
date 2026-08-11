import { useState } from 'react';
import { View } from 'react-native';

import { LogValueSheet } from './LogValueSheet';
import { Button, Card, Text } from '@/components/ui';
import type { WeightSummary } from '@/domain/progress/weightSummary';
import { useLogWeight } from '@/hooks/useLogs';
import { useTheme } from '@/theme/ThemeProvider';

interface WeightCardProps {
  summary: WeightSummary;
}

/**
 * Bodyweight on the dashboard.
 *
 * The 7-day average is given equal billing with today's reading, and the trend
 * message explains what the app makes of it. That ordering is the point: the
 * daily number is the noisy one, and the app should not train users to react
 * to it (SCIENTIFIC_RULES.md §5).
 */
export function WeightCard({ summary }: WeightCardProps) {
  const theme = useTheme();
  const [isLogging, setIsLogging] = useState(false);
  const logWeight = useLogWeight();

  const toneForAssessment =
    summary.assessment === 'on_target'
      ? 'success'
      : summary.assessment === 'unknown'
        ? 'tertiary'
        : 'warning';

  return (
    <>
      <Card>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="label" tone="tertiary">
                Weight
              </Text>
              <Text variant="title">
                {summary.latest ? `${summary.latest.weightKg.toFixed(1)} kg` : 'Not logged'}
              </Text>
              {summary.latest && !summary.loggedToday ? (
                <Text variant="caption" tone="tertiary">
                  Last logged {summary.latest.date}
                </Text>
              ) : null}
            </View>

            <View style={{ gap: theme.spacing.xs, alignItems: 'flex-end' }}>
              <Text variant="label" tone="tertiary">
                7-day average
              </Text>
              <Text variant="title" tone={summary.averageKg === null ? 'tertiary' : 'primary'}>
                {summary.averageKg === null ? '—' : `${summary.averageKg.toFixed(1)} kg`}
              </Text>
              {summary.trend ? (
                <Text variant="caption" tone={toneForAssessment}>
                  {summary.trend.kgPerWeek > 0 ? '↑' : summary.trend.kgPerWeek < 0 ? '↓' : '→'}{' '}
                  {Math.abs(summary.trend.kgPerWeek).toFixed(2)} kg/week
                </Text>
              ) : null}
            </View>
          </View>

          <Text variant="caption" tone="secondary">
            {summary.message}
          </Text>

          <Button
            label={summary.loggedToday ? "Update today's weight" : "Log today's weight"}
            variant="secondary"
            size="sm"
            onPress={() => setIsLogging(true)}
          />
        </View>
      </Card>

      <LogValueSheet
        visible={isLogging}
        onClose={() => setIsLogging(false)}
        title="Log your weight"
        label="Bodyweight"
        suffix="kg"
        precision={1}
        min={20}
        max={400}
        initialValue={summary.loggedToday ? (summary.latest?.weightKg ?? null) : null}
        hint="Weigh in under the same conditions each time — ideally first thing in the morning."
        onSave={async (weightKg) => {
          await logWeight.mutateAsync({ weightKg });
        }}
      />
    </>
  );
}
