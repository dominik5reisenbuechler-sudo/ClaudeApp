import { View } from 'react-native';

import { Card, ProgressBar, Text } from '@/components/ui';
import type { TdeeEstimate } from '@/domain/nutrition/tdeeEstimator';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The measured expenditure figure.
 *
 * Shown at every confidence level, including the ones the engine will not act
 * on — hiding the number until it is certain would mean the user never sees it
 * converge, and never learns what makes it converge. The confidence bar and the
 * explanation carry the caveat instead.
 */
export function TdeeCard({ estimate }: { estimate: TdeeEstimate | null }) {
  const theme = useTheme();

  if (!estimate) {
    return (
      <Card>
        <Text variant="caption" tone="tertiary">
          Working out your expenditure…
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="label" tone="tertiary">
          Measured daily expenditure
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
          <Text variant="hero">
            {estimate.estimatedTdeeKcal === null
              ? '—'
              : estimate.estimatedTdeeKcal.toLocaleString('en-US')}
          </Text>
          <Text variant="body" tone="tertiary">
            kcal
          </Text>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" tone="tertiary">
              Confidence
            </Text>
            <Text variant="mono" tone={estimate.isUsable ? 'success' : 'warning'}>
              {Math.round(estimate.confidence.overall * 100)}%
            </Text>
          </View>
          <ProgressBar value={estimate.confidence.overall} target={1} height={4} showOvershoot={false} />
        </View>

        <Text variant="caption" tone="secondary">
          {estimate.explanation}
        </Text>

        <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
          <Stat label="Weigh-ins" value={`${estimate.weighInCount}`} />
          <Stat label="Days logged" value={`${estimate.loggedDayCount}`} />
          <Stat label="Window" value={`${estimate.daysAnalysed} d`} />
        </View>
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="mono">{value}</Text>
    </View>
  );
}
