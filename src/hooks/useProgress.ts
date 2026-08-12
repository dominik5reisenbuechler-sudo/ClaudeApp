import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { detectPersonalRecords } from '@/domain/progress/personalRecords';
import type { RecordCandidateSet } from '@/domain/progress/personalRecords';
import { summarizeConsistency, sessionsPerWeek } from '@/domain/progress/consistency';
import { strengthTrend, trackedExercises } from '@/domain/progress/strengthProgress';
import {
  deleteMeasurement,
  fetchMeasurements,
  fetchPersonalRecords,
  saveDetectedRecords,
  toExistingRecords,
  upsertMeasurement,
} from '@/services/progressService';
import { useSessionHistory } from './useTraining';
import { usePreferences } from './useProfile';
import { toStrengthSets } from '@/services/trainingService';
import type { FullSession } from '@/services/trainingService';
import type { MeasurementSite } from '@/types/database';
import type { IsoDate } from '@/types/domain';
import { addDays, todayIsoDate } from '@/utils/date';

/**
 * Progress queries.
 *
 * Everything here derives from rows already fetched elsewhere — sessions, sets,
 * weight logs — through pure domain functions. Nothing analytical is stored, so
 * a correction to a logged set flows through to every chart on the next read.
 */

const MEASUREMENT_KEY = 'measurements';
const PR_KEY = 'personal-records';

export function useMeasurements(days = 365) {
  const { user } = useAuth();
  const userId = user?.id;
  const today = todayIsoDate();
  const from = addDays(today, -(days - 1));

  return useQuery({
    queryKey: [MEASUREMENT_KEY, userId ?? 'anonymous', from, today],
    queryFn: () => fetchMeasurements(userId as string, from, today),
    enabled: Boolean(userId),
  });
}

export function useSaveMeasurement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      site,
      valueCm,
      measuredOn = todayIsoDate(),
    }: {
      site: MeasurementSite;
      valueCm: number;
      measuredOn?: IsoDate;
    }) => upsertMeasurement(user?.id as string, measuredOn, site, valueCm),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MEASUREMENT_KEY] }),
  });
}

export function useDeleteMeasurement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMeasurement(user?.id as string, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MEASUREMENT_KEY] }),
  });
}

export function usePersonalRecords() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [PR_KEY, userId ?? 'anonymous'],
    queryFn: () => fetchPersonalRecords(userId as string),
    enabled: Boolean(userId),
  });
}

/** Sets from completed sessions, in the shape the progress domain consumes. */
function toRecordCandidates(session: FullSession): RecordCandidateSet[] {
  return session.sets.map((set) => ({
    id: set.id,
    exerciseId: set.exercise_id,
    weightKg: set.weight_kg === null ? null : Number(set.weight_kg),
    reps: set.reps === null ? null : Number(set.reps),
    setType: set.set_type,
    isCompleted: set.is_completed,
    performedOn: set.performed_at.slice(0, 10) as IsoDate,
  }));
}

/**
 * Detect and persist records for a finished session.
 *
 * Called explicitly after a session completes rather than run as a background
 * job: the user should see "new personal best" while they are still in the gym,
 * and a client-side call keeps that immediate without an Edge Function.
 */
export function useDetectRecordsForSession() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const existing = usePersonalRecords();

  return useMutation({
    mutationFn: async (session: FullSession) => {
      const detected = detectPersonalRecords(
        toRecordCandidates(session),
        toExistingRecords(existing.data ?? []),
      );
      await saveDetectedRecords(user?.id as string, detected);
      return detected;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PR_KEY] }),
  });
}

export function useStrengthProgress() {
  const history = useSessionHistory(60);

  return useMemo(() => {
    const sets = toStrengthSets(history.data ?? []);
    const exercises = trackedExercises(sets);

    return {
      exercises,
      trendFor: (exerciseId: string) => strengthTrend(sets, exerciseId),
      isLoading: history.isLoading,
      isError: history.isError,
    };
  }, [history.data, history.isLoading, history.isError]);
}

export function useTrainingConsistency() {
  const history = useSessionHistory(60);
  const preferences = usePreferences();
  const today = todayIsoDate();

  return useMemo(() => {
    const sessions = (history.data ?? []).map((session) => ({
      date: session.started_at.slice(0, 10) as IsoDate,
      completed: session.completed_at !== null,
    }));

    return {
      summary: summarizeConsistency(
        sessions,
        preferences.data?.training_days_per_week ?? 4,
        today,
      ),
      weekly: sessionsPerWeek(sessions, today, 8),
      plannedPerWeek: preferences.data?.training_days_per_week ?? 4,
      isLoading: history.isLoading || preferences.isLoading,
      isError: history.isError || preferences.isError,
    };
  }, [history.data, history.isLoading, history.isError, preferences.data, preferences.isLoading, preferences.isError, today]);
}
