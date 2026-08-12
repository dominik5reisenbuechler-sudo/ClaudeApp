import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { reconcileSteps, reconcileWeights } from '@/domain/health/reconcile';
import type { ExistingLog } from '@/domain/health/reconcile';
import { getHealthProvider, logSourceFor, NO_PERMISSIONS } from '@/integrations/health';
import type { HealthMetric, HealthPermissionState } from '@/integrations/health';
import { importStepLogs, importWeightLogs, fetchLogSources } from '@/services/logService';
import { recordConsent } from '@/services/profileService';
import { queryKeys } from '@/lib/queryClient';
import type { IsoDate } from '@/types/domain';
import { addDays, todayIsoDate } from '@/utils/date';

/**
 * Reading bodyweight and steps from the platform health store.
 *
 * Nothing here happens on its own. There is no sync-on-launch, no background
 * fetch and no "we noticed you have Apple Health" prompt: health data is the
 * most sensitive category the app touches, and a silent import of someone's
 * weight history is not something to do because it was technically possible
 * (CLAUDE.md §56). The user grants consent, then presses sync.
 *
 * Smart scales need no separate path. Withings, Renpho and the rest write into
 * Apple Health or Health Connect, so they arrive here — and `reconcileWeights`
 * records a hardware reading as `smart_scale` rather than as a phone entry.
 */

/** Days of history a sync pulls. A month covers a missed sync comfortably. */
export const HEALTH_SYNC_DAYS = 30;

export function useHealthAvailability() {
  const provider = getHealthProvider();

  return useQuery({
    queryKey: ['health-availability', provider.id],
    queryFn: async () => ({
      id: provider.id,
      label: provider.label,
      isAvailable: await provider.isAvailable(),
      capabilities: provider.capabilities(),
    }),
    staleTime: 60 * 60_000,
  });
}

export function useHealthPermissions() {
  const provider = getHealthProvider();
  const [permissions, setPermissions] = useState<HealthPermissionState>(NO_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void provider.getPermissions().then((state) => {
      if (cancelled) return;
      setPermissions(state);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  const request = useCallback(
    async (metrics: readonly HealthMetric[]) => {
      const state = await provider.requestPermissions(metrics);
      setPermissions(state);
      return state;
    },
    [provider],
  );

  return { permissions, isLoading, request };
}

export interface HealthSyncOutcome {
  weightSummary: string;
  stepSummary: string;
  importedWeights: number;
  importedSteps: number;
}

/**
 * Pull the last month of samples and fill gaps.
 *
 * Only gaps: a day the user logged by hand is left exactly as it is, and the
 * summary says how many were left alone. Silently doing less than the user
 * expected is how a sync button loses trust.
 */
export function useHealthSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const provider = getHealthProvider();

  return useMutation({
    mutationFn: async (): Promise<HealthSyncOutcome> => {
      const userId = user?.id as string;
      const to = todayIsoDate();
      const from = addDays(to, -(HEALTH_SYNC_DAYS - 1));
      const source = logSourceFor(provider.id);

      const [weightSamples, stepSamples, existing] = await Promise.all([
        provider.readWeights(from, to),
        provider.readSteps(from, to),
        fetchLogSources(userId, from, to),
      ]);

      const weights = reconcileWeights(weightSamples, existing.weights as ExistingLog[], source);
      const steps = reconcileSteps(stepSamples, existing.steps as ExistingLog[], source);

      await Promise.all([
        importWeightLogs(userId, weights.toInsert),
        importStepLogs(userId, steps.toInsert),
      ]);

      return {
        weightSummary: weights.summary,
        stepSummary: steps.summary,
        importedWeights: weights.toInsert.length,
        importedSteps: steps.toInsert.length,
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.weightLogs(user?.id ?? '', '', '') });
      void queryClient.invalidateQueries({ queryKey: ['weight-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['step-logs'] });
    },
  });
}

/**
 * Consent for reading health data, recorded in `user_consents`.
 *
 * Separate from the platform permission on purpose. The OS prompt asks whether
 * this app may read the health store; this asks whether the user wants us to.
 * Revoking here stops the sync even while the OS grant remains, which is the
 * only way "turn it off" can mean what the user thinks it means.
 */
export function useHealthConsent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (granted: boolean) => recordConsent(user?.id as string, 'health_data', granted),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['health-consent'] });
    },
  });
}

/** Days covered by the most recent sync, for the settings screen. */
export function syncWindow(today: IsoDate = todayIsoDate()): { from: IsoDate; to: IsoDate } {
  return { from: addDays(today, -(HEALTH_SYNC_DAYS - 1)), to: today };
}
