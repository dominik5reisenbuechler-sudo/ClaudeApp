import { useState } from 'react';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout';
import { Button, Callout, Card, Text } from '@/components/ui';
import { HEALTH_METRIC_LABELS } from '@/integrations/health';
import type { HealthMetric } from '@/integrations/health';
import {
  useHealthAvailability,
  useHealthConsent,
  useHealthPermissions,
  useHealthSync,
} from '@/hooks/useHealthSync';
import { useTheme } from '@/theme/ThemeProvider';

/** What the app asks for. Nothing else, and nothing "just in case". */
const REQUESTED: readonly HealthMetric[] = ['weight', 'steps'];

/**
 * Health app connection.
 *
 * Consent first, then the platform permission, then a manual sync. There is no
 * automatic import: reading someone's weight history is not something to do
 * because it was technically possible, and a background sync would make "when
 * did the app read this" unanswerable.
 *
 * When no health store is available — which is every build today, see
 * `integrations/health/index.ts` — the section says so plainly rather than
 * showing a button that does nothing.
 */
export function HealthSyncSection() {
  const theme = useTheme();
  const availability = useHealthAvailability();
  const { permissions, request } = useHealthPermissions();
  const consent = useHealthConsent();
  const sync = useHealthSync();

  const [granted, setGranted] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const isAvailable = availability.data?.isAvailable ?? false;
  const canRead = permissions.weight === 'granted' || permissions.steps === 'granted';

  return (
    <View>
      <SectionHeader title="Health app" />
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          {!isAvailable ? (
            <>
              <Text variant="caption" tone="secondary">
                This device has no health store the app can read — that is normal on the web, and on
                a build without the native health modules included.
              </Text>
              <Text variant="caption" tone="tertiary">
                Smart scales sync through Apple Health or Health Connect, so they arrive by this
                same route once it is available. Until then, weigh-ins and steps are entered by
                hand, which the rest of the app treats identically.
              </Text>
            </>
          ) : (
            <>
              <Text variant="caption" tone="secondary">
                {`Import bodyweight and steps from ${availability.data?.label ?? 'your health app'}. We only ever fill gaps — a day you logged yourself is left exactly as you entered it.`}
              </Text>

              <View style={{ gap: theme.spacing.xs }}>
                {REQUESTED.map((metric) => (
                  <View
                    key={metric}
                    style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                  >
                    <Text variant="caption" tone="tertiary">
                      {HEALTH_METRIC_LABELS[metric]}
                    </Text>
                    <Text
                      variant="caption"
                      tone={permissions[metric] === 'granted' ? 'success' : 'tertiary'}
                    >
                      {permissions[metric] === 'granted' ? 'Allowed' : 'Not allowed'}
                    </Text>
                  </View>
                ))}
              </View>

              {!granted ? (
                <Button
                  label="Connect"
                  onPress={() => {
                    consent.mutate(true, {
                      onSuccess: () => {
                        setGranted(true);
                        void request(REQUESTED);
                      },
                    });
                  }}
                  loading={consent.isPending}
                />
              ) : (
                <Button
                  label="Sync the last 30 days"
                  disabled={!canRead}
                  loading={sync.isPending}
                  onPress={() => {
                    sync.mutate(undefined, {
                      onSuccess: (result) =>
                        setOutcome(`${result.weightSummary} ${result.stepSummary}`),
                    });
                  }}
                />
              )}

              {outcome ? (
                <Callout tone="success" title="Synced">
                  <Text variant="caption" tone="secondary">
                    {outcome}
                  </Text>
                </Callout>
              ) : null}

              {granted ? (
                <Button
                  label="Disconnect"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    consent.mutate(false, { onSuccess: () => setGranted(false) });
                  }}
                />
              ) : null}
            </>
          )}
        </View>
      </Card>
    </View>
  );
}
