import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, SectionHeader } from '@/components/layout';
import {
  BottomSheet,
  Button,
  Callout,
  Card,
  ErrorState,
  LineChart,
  LoadingState,
  NumberInput,
  Chip,
  Text,
} from '@/components/ui';
import { movingAverage, weightTrend } from '@/domain/nutrition/weightTrend';
import { summarizeWeight } from '@/domain/progress/weightSummary';
import { ProgressSubNav } from '@/features/progress/ProgressSubNav';
import { useWeightLogs } from '@/hooks/useLogs';
import { useMeasurements, useSaveMeasurement } from '@/hooks/useProgress';
import { useActiveGoal } from '@/hooks/useProfile';
import { useTheme } from '@/theme/ThemeProvider';
import type { MeasurementSite } from '@/types/database';
import { daysBetween, todayIsoDate } from '@/utils/date';

const SITES: readonly { id: MeasurementSite; label: string }[] = [
  { id: 'waist', label: 'Waist' },
  { id: 'chest', label: 'Chest' },
  { id: 'arm', label: 'Arm' },
  { id: 'thigh', label: 'Thigh' },
  { id: 'hip', label: 'Hips' },
  { id: 'calf', label: 'Calf' },
];

/**
 * Body progress: weight and measurements.
 *
 * The chart shows the raw weigh-ins faintly and the 7-day average boldly. That
 * ordering is the message: the smoothed line is the one to read, and the daily
 * scatter is there to show how noisy the underlying numbers are.
 */
export default function BodyProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = todayIsoDate();

  const weights = useWeightLogs(180, today);
  const goal = useActiveGoal();
  const measurements = useMeasurements();
  const saveMeasurement = useSaveMeasurement();

  const [sheetSite, setSheetSite] = useState<MeasurementSite | null>(null);

  const points = useMemo(() => weights.data ?? [], [weights.data]);
  const summary = useMemo(
    () => summarizeWeight(points, goal.data?.goal ?? 'maintenance', today),
    [points, goal.data, today],
  );

  const chart = useMemo(() => {
    const smoothed = movingAverage(points, 7);
    if (smoothed.length === 0) return null;

    const first = smoothed[0]?.date as string;
    const raw = smoothed.map((point) => ({
      x: daysBetween(first, point.date),
      y: point.weightKg,
    }));
    const average = smoothed
      .filter((point) => point.averageKg !== null)
      .map((point) => ({ x: daysBetween(first, point.date), y: point.averageKg as number }));

    return { raw, average, first, last: smoothed[smoothed.length - 1]?.date as string };
  }, [points]);

  const thirtyDayTrend = useMemo(() => weightTrend(points, 30), [points]);

  const latestBySite = useMemo(() => {
    const map = new Map<MeasurementSite, { value: number; date: string }>();
    for (const row of measurements.data ?? []) {
      const existing = map.get(row.site);
      if (!existing || row.measured_on > existing.date) {
        map.set(row.site, { value: Number(row.value_cm), date: row.measured_on });
      }
    }
    return map;
  }, [measurements.data]);

  if (weights.isLoading || goal.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (weights.isError) {
    return (
      <Screen>
        <ErrorState
          message="We could not load your weight history."
          onRetry={() => void weights.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Progress" title="Body" />
      <ProgressSubNav active="body" />

      <Card>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text variant="label" tone="tertiary">
                7-day average
              </Text>
              <Text variant="title">
                {summary.averageKg === null ? '—' : `${summary.averageKg.toFixed(1)} kg`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="label" tone="tertiary">
                30-day trend
              </Text>
              <Text variant="title" tone={thirtyDayTrend === null ? 'tertiary' : 'primary'}>
                {thirtyDayTrend === null
                  ? '—'
                  : `${thirtyDayTrend.kgPerWeek > 0 ? '+' : ''}${thirtyDayTrend.kgPerWeek} kg/wk`}
              </Text>
            </View>
          </View>

          {chart ? (
            <LineChart
              series={[
                { points: chart.average, color: theme.colors.accent, label: '7-day average' },
                { points: chart.raw, color: theme.colors.borderStrong, dashed: true, label: 'Daily' },
              ]}
              formatY={(value) => `${value.toFixed(1)}`}
              xLabels={{ start: formatShort(chart.first), end: formatShort(chart.last) }}
              accessibilityLabel="Bodyweight over time, with the seven-day average"
            />
          ) : (
            <Text variant="caption" tone="tertiary">
              Log your weight a few times and the trend will appear here.
            </Text>
          )}

          <Text variant="caption" tone="secondary">
            {summary.message}
          </Text>
        </View>
      </Card>

      <View>
        <SectionHeader title="Measurements" />
        <Card padding="md">
          <View style={{ gap: theme.spacing.md }}>
            {SITES.map((site) => {
              const latest = latestBySite.get(site.id);
              return (
                <View
                  key={site.id}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text variant="body">{site.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                    <Text variant="mono" tone={latest ? 'primary' : 'tertiary'}>
                      {latest ? `${latest.value} cm` : '—'}
                    </Text>
                    <Chip label="Log" onPress={() => setSheetSite(site.id)} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
        <Text variant="caption" tone="tertiary" style={{ marginTop: theme.spacing.sm }}>
          Measure under the same conditions each time — same time of day, same tension on the tape.
          Waist at the navel is the most useful single number alongside bodyweight.
        </Text>
      </View>

      <Card onPress={() => router.push('/progress/photos')}>
        <Text variant="bodyStrong">Progress photos</Text>
        <Text variant="caption" tone="secondary">
          The measurement the scale cannot make. Stored privately, and the only evidence that still
          shows something during a recomposition, when bodyweight refuses to move at all.
        </Text>
      </Card>

      <MeasurementSheet
        site={sheetSite}
        currentValue={sheetSite ? (latestBySite.get(sheetSite)?.value ?? null) : null}
        onClose={() => setSheetSite(null)}
        onSave={async (valueCm) => {
          if (!sheetSite) return;
          await saveMeasurement.mutateAsync({ site: sheetSite, valueCm });
        }}
      />
    </Screen>
  );
}

function MeasurementSheet({
  site,
  currentValue,
  onClose,
  onSave,
}: {
  site: MeasurementSite | null;
  currentValue: number | null;
  onClose: () => void;
  onSave: (valueCm: number) => Promise<void>;
}) {
  const label = SITES.find((entry) => entry.id === site)?.label ?? '';

  return (
    <BottomSheet visible={site !== null} onClose={onClose} title={`Log ${label.toLowerCase()}`}>
      {site ? (
        <MeasurementForm currentValue={currentValue} onClose={onClose} onSave={onSave} />
      ) : null}
    </BottomSheet>
  );
}

function MeasurementForm({
  currentValue,
  onClose,
  onSave,
}: {
  currentValue: number | null;
  onClose: () => void;
  onSave: (valueCm: number) => Promise<void>;
}) {
  const theme = useTheme();
  const [value, setValue] = useState<number | null>(currentValue);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (value === null || value <= 0 || value > 250) {
      setError('Enter a measurement in centimetres');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(value);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <NumberInput
        label="Measurement"
        suffix="cm"
        value={value}
        onChangeValue={(next) => {
          setValue(next);
          setError(null);
        }}
        autoFocus
      />
      {error ? (
        <Callout tone="danger">
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </Callout>
      ) : null}
      <Button label="Save" loading={isSaving} onPress={() => void handleSave()} />
    </View>
  );
}

function formatShort(date: string): string {
  return date.slice(5).replace('-', '/');
}
