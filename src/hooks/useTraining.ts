import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { generateTrainingPlan } from '@/domain/training/planGeneration';
import type { GeneratedTrainingPlan } from '@/domain/training/planGeneration';
import { summarizeWeeklyVolume, setsInWindow } from '@/domain/training/volume';
import {
  completeSession,
  deleteSet,
  fetchActivePlan,
  fetchActiveSession,
  fetchAlternatives,
  fetchExerciseMuscles,
  fetchExercises,
  fetchMuscles,
  fetchRecentSetsForExercise,
  fetchSession,
  fetchSessionHistory,
  logSet,
  saveGeneratedPlan,
  startSession,
  swapPlanExercise,
  toContributionMap,
  toMuscleBands,
  toPerformedSets,
  toPlannableExercises,
} from '@/services/trainingService';
import type { LogSetInput } from '@/services/trainingService';
import { usePreferences } from './useProfile';
import type { ExperienceLevel, MuscleId, MusclePriority } from '@/types/domain';
import { todayIsoDate } from '@/utils/date';

/**
 * Training queries and mutations.
 *
 * Reference data (muscles, exercises, fractional credits) is cached hard — it
 * is seeded content. Everything derived from sets is recomputed by the domain
 * layer on read, never stored.
 */

const PLAN_KEY = 'workout-plan';
const SESSION_KEY = 'workout-session';
const REFERENCE_STALE_TIME = 60 * 60_000;

export function useMuscles() {
  return useQuery({ queryKey: ['muscles'], queryFn: fetchMuscles, staleTime: REFERENCE_STALE_TIME });
}

export function useExercises() {
  return useQuery({
    queryKey: ['exercises'],
    queryFn: fetchExercises,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useExerciseMuscles() {
  return useQuery({
    queryKey: ['exercise-muscles'],
    queryFn: fetchExerciseMuscles,
    staleTime: REFERENCE_STALE_TIME,
  });
}

/** The fractional credit map, in the shape the volume domain consumes. */
export function useContributionMap() {
  const exerciseMuscles = useExerciseMuscles();
  return useMemo(
    () => toContributionMap(exerciseMuscles.data ?? []),
    [exerciseMuscles.data],
  );
}

export function useExerciseAlternatives(exerciseId: string | null) {
  return useQuery({
    queryKey: ['exercise-alternatives', exerciseId ?? 'none'],
    queryFn: () => fetchAlternatives(exerciseId as string),
    enabled: Boolean(exerciseId),
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useActivePlan() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [PLAN_KEY, userId ?? 'anonymous'],
    queryFn: () => fetchActivePlan(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Generate and persist a programme from the user's onboarding preferences.
 *
 * Everything the generator needs is already cached, so this is a pure call plus
 * the writes. The parameters are stored with the plan, which is what makes
 * "why is Tuesday like this?" answerable later.
 */
export function useGenerateTrainingPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const muscles = useMuscles();
  const exercises = useExercises();
  const exerciseMuscles = useExerciseMuscles();
  const preferences = usePreferences();

  const isReady = muscles.isSuccess && exercises.isSuccess && exerciseMuscles.isSuccess;

  const mutation = useMutation<GeneratedTrainingPlan, Error, void>({
    mutationFn: async () => {
      const contributions = toContributionMap(exerciseMuscles.data ?? []);
      const bands = toMuscleBands(muscles.data ?? []);

      const params = {
        daysPerWeek: preferences.data?.training_days_per_week ?? 4,
        sessionMinutes: preferences.data?.session_minutes ?? 60,
        experience: (preferences.data?.experience ?? 'intermediate') as ExperienceLevel,
        availableEquipment: preferences.data?.available_equipment ?? [],
        musclePriorities: (preferences.data?.muscle_priorities ?? {}) as Partial<
          Record<MuscleId, MusclePriority>
        >,
      };

      const generated = generateTrainingPlan({
        ...params,
        exercises: toPlannableExercises(exercises.data ?? [], contributions),
        muscleBands: bands,
      });

      await saveGeneratedPlan(user?.id as string, generated, params, todayIsoDate());
      return generated;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });

  return { ...mutation, isReady };
}

export function useSwapPlanExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workoutExerciseId,
      newExerciseId,
    }: {
      workoutExerciseId: string;
      newExerciseId: string;
    }) => swapPlanExercise(workoutExerciseId, newExerciseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLAN_KEY] }),
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function useActiveSession() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [SESSION_KEY, 'active', userId ?? 'anonymous'],
    queryFn: () => fetchActiveSession(userId as string),
    enabled: Boolean(userId),
  });
}

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: [SESSION_KEY, sessionId ?? 'none'],
    queryFn: () => fetchSession(sessionId as string),
    enabled: Boolean(sessionId),
  });
}

export function useStartSession() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workoutDayId, name }: { workoutDayId: string | null; name: string | null }) =>
      startSession(user?.id as string, workoutDayId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SESSION_KEY] }),
  });
}

export function useLogSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogSetInput) => logSet(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SESSION_KEY] }),
  });
}

export function useDeleteSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => deleteSet(setId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SESSION_KEY] }),
  });
}

export function useCompleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      sessionRpe,
      notes,
    }: {
      sessionId: string;
      sessionRpe: number | null;
      notes: string | null;
    }) => completeSession(sessionId, sessionRpe, notes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SESSION_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['session-history'] });
    },
  });
}

export function useSessionHistory(limit = 30) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['session-history', userId ?? 'anonymous', limit],
    queryFn: () => fetchSessionHistory(userId as string, limit),
    enabled: Boolean(userId),
  });
}

/** Previous sessions for one exercise — the reference panel in the logger. */
export function useRecentSetsForExercise(exerciseId: string | null) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['exercise-history', userId ?? 'anonymous', exerciseId ?? 'none'],
    queryFn: () => fetchRecentSetsForExercise(userId as string, exerciseId as string),
    enabled: Boolean(userId && exerciseId),
  });
}

/**
 * This week's fractional set counts per muscle, from logged sessions.
 *
 * The whole point of the fractional model: a bench press credits chest fully
 * and triceps partially, so these numbers reflect what was actually trained.
 */
export function useWeeklyVolume() {
  const history = useSessionHistory(40);
  const contributions = useContributionMap();
  const muscles = useMuscles();

  return useMemo(() => {
    const sets = setsInWindow(toPerformedSets(history.data ?? []), todayIsoDate());
    const bands = toMuscleBands(muscles.data ?? []);
    return {
      summary: summarizeWeeklyVolume(sets, contributions, bands),
      isLoading: history.isLoading || muscles.isLoading,
      isError: history.isError || muscles.isError,
    };
  }, [history.data, history.isLoading, history.isError, contributions, muscles.data, muscles.isLoading, muscles.isError]);
}
