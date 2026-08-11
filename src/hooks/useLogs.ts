import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryClient';
import {
  fetchStepLogs,
  fetchWeightLogs,
  toWeightPoints,
  upsertStepLog,
  upsertWeightLog,
} from '@/services/logService';
import type { StepPoint } from '@/domain/activity/steps';
import type { IsoDate, WeightPoint } from '@/types/domain';
import { addDays, todayIsoDate } from '@/utils/date';

/**
 * Daily-log queries and mutations.
 *
 * The window defaults are chosen by what the domain functions need, not by what
 * the screen happens to show: the trend estimator looks back up to 28 days and
 * benefits from more history, so the dashboard fetches a wider range than it
 * renders.
 */

/** Enough history for a 30-day trend plus room for backdated entries. */
export const WEIGHT_HISTORY_DAYS = 120;
export const STEP_HISTORY_DAYS = 30;

export function useWeightLogs(days: number = WEIGHT_HISTORY_DAYS, today: IsoDate = todayIsoDate()) {
  const { user } = useAuth();
  const userId = user?.id;
  const from = addDays(today, -(days - 1));

  return useQuery({
    queryKey: queryKeys.weightLogs(userId ?? 'anonymous', from, today),
    queryFn: async (): Promise<WeightPoint[]> =>
      toWeightPoints(await fetchWeightLogs(userId as string, from, today)),
    enabled: Boolean(userId),
  });
}

export function useStepLogs(days: number = STEP_HISTORY_DAYS, today: IsoDate = todayIsoDate()) {
  const { user } = useAuth();
  const userId = user?.id;
  const from = addDays(today, -(days - 1));

  return useQuery({
    queryKey: queryKeys.stepLogs(userId ?? 'anonymous', from, today),
    queryFn: async (): Promise<StepPoint[]> => {
      const rows = await fetchStepLogs(userId as string, from, today);
      return rows.map((row) => ({ date: row.logged_on, steps: row.steps }));
    },
    enabled: Boolean(userId),
  });
}

export function useLogWeight() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      weightKg,
      loggedOn = todayIsoDate(),
      note,
    }: {
      weightKg: number;
      loggedOn?: IsoDate;
      note?: string;
    }) => upsertWeightLog(user?.id as string, loggedOn, weightKg, note),
    // Invalidate by prefix rather than by exact key: the query key carries the
    // date range, and a backdated entry belongs to a range the caller does not
    // know about.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight-logs'] }),
  });
}

export function useLogSteps() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ steps, loggedOn = todayIsoDate() }: { steps: number; loggedOn?: IsoDate }) =>
      upsertStepLog(user?.id as string, loggedOn, steps),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['step-logs'] }),
  });
}
