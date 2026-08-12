import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { requiresConfirmation } from '@/domain/coach/actions';
import type { CoachAction, CoachReply } from '@/domain/coach/actions';
import { buildCoachContext, COACH_HISTORY_DAYS } from '@/domain/coach/context';
import type { CoachContext, CoachExerciseContext } from '@/domain/coach/context';
import { totalsFor } from '@/domain/nutrition/dailyTotals';
import { screenForSafety } from '@/domain/nutrition/safety';
import { estimatedOneRepMax } from '@/domain/training/progression';
import { strengthTrend, trackedExercises } from '@/domain/progress/strengthProgress';
import { averageAsOf, weightTrend } from '@/domain/nutrition/weightTrend';
import { getCoachProvider, COACH_FAILURE_MESSAGES } from '@/integrations/ai';
import type { CoachTurn } from '@/integrations/ai';
import { nutritionForGrams } from '@/domain/nutrition/foodMath';
import { createFoodEntry, toLoggedEntries } from '@/services/foodEntryService';
import { fetchFoodById } from '@/services/foodService';
import { upsertWeightLog } from '@/services/logService';
import { setActiveTarget } from '@/services/profileService';
import { toStrengthSets } from '@/services/trainingService';
import { useTdeeEstimate } from './useCheckin';
import { useWeightLogs } from './useLogs';
import { useFoodEntriesInRange } from './useNutrition';
import { useActiveGoal, useActiveTarget, usePreferences, useProfile } from './useProfile';
import { useExercises, useSessionHistory, useWeeklyVolume } from './useTraining';
import { queryKeys } from '@/lib/queryClient';
import type { MuscleId } from '@/types/domain';
import { addDays, ageOn, todayIsoDate } from '@/utils/date';

/**
 * The AI coach.
 *
 * Two things this hook is careful about.
 *
 * **The context is built here and nowhere else**, from the same queries every
 * other screen uses, so the coach cannot answer from numbers that disagree with
 * what the user is looking at.
 *
 * **No action executes without a tap.** `ask` returns proposals; `perform` runs
 * one, and it is only ever called from a confirmation button. The coach has no
 * path to a write of its own — see `domain/coach/actions.ts` for why that is a
 * boundary rather than a courtesy.
 */

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: CoachAction[];
}

export function useCoachContext(): { context: CoachContext | null; isLoading: boolean } {
  const today = todayIsoDate();
  const from = addDays(today, -(COACH_HISTORY_DAYS - 1));

  const profile = useProfile();
  const preferences = usePreferences();
  const goal = useActiveGoal();
  const target = useActiveTarget();
  const weights = useWeightLogs(90, today);
  const entries = useFoodEntriesInRange(from, today);
  const sessions = useSessionHistory(60);
  const exercises = useExercises();
  const volume = useWeeklyVolume();
  const { estimate, isLoading: estimateLoading } = useTdeeEstimate(today);

  const isLoading =
    profile.isLoading ||
    preferences.isLoading ||
    goal.isLoading ||
    target.isLoading ||
    weights.isLoading ||
    entries.isLoading ||
    sessions.isLoading ||
    volume.isLoading ||
    estimateLoading;

  return useMemo(() => {
    if (isLoading) return { context: null, isLoading: true };

    const points = weights.data ?? [];
    const trend = weightTrend(points, 28, 7);

    const loggedDays = new Map<string, ReturnType<typeof toLoggedEntries>>();
    for (const entry of entries.data ?? []) {
      loggedDays.set(entry.logged_on, [
        ...(loggedDays.get(entry.logged_on) ?? []),
        ...toLoggedEntries([entry]),
      ]);
    }

    const dayTotals = [...loggedDays.values()].map((day) => totalsFor(day));
    const meanOf = (values: number[]): number | null =>
      values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

    const sets = toStrengthSets(sessions.data ?? []);
    const nameById = new Map((exercises.data ?? []).map((row) => [row.id, row.name]));

    const recentExercises: CoachExerciseContext[] = trackedExercises(sets, 1).map((exerciseId) => {
      const trendForExercise = strengthTrend(sets, exerciseId);
      const last = [...sets]
        .filter((set) => set.exerciseId === exerciseId && set.isCompleted)
        .sort((a, b) => (a.performedOn < b.performedOn ? 1 : -1))[0];

      return {
        name: nameById.get(exerciseId) ?? exerciseId,
        lastWeightKg: last?.weightKg ?? null,
        lastReps: last?.reps ?? null,
        lastRir: null,
        estimatedOneRmKg:
          last?.weightKg && last?.reps ? estimatedOneRepMax(last.weightKg, last.reps) : null,
        trendKgPerWeek: trendForExercise.kgPerWeek,
      };
    });

    const weeklySetsByMuscle: Record<string, number> = {};
    for (const summary of volume.summary) {
      if (summary.sets > 0) weeklySetsByMuscle[summary.muscleId as MuscleId] = summary.sets;
    }

    const weightKg = averageAsOf(points, today);
    const safetyFlags =
      profile.data?.sex && profile.data.height_cm && profile.data.birth_date && weightKg !== null
        ? screenForSafety({
            ageYears: ageOn(profile.data.birth_date, today),
            sex: profile.data.sex,
            weightKg,
            heightCm: Number(profile.data.height_cm),
            isPregnantOrBreastfeeding: preferences.data?.is_pregnant_or_breastfeeding ?? false,
            hasMedicalCondition: preferences.data?.has_medical_condition ?? false,
            eatingDisorderRisk: preferences.data?.eating_disorder_risk ?? false,
            reportsAcuteSymptoms: preferences.data?.reports_acute_symptoms ?? false,
          }).map((flag) => `${flag.code}: ${flag.message}`)
        : [];

    return {
      context: buildCoachContext({
        today,
        profile: {
          ageYears: profile.data?.birth_date ? ageOn(profile.data.birth_date, today) : null,
          sex: profile.data?.sex ?? null,
          heightCm: profile.data?.height_cm ? Number(profile.data.height_cm) : null,
          experience: preferences.data?.experience ?? null,
          goal: goal.data?.goal ?? null,
          dietType: preferences.data?.diet_type ?? null,
          allergens: preferences.data?.allergens ?? [],
          safetyFlags,
        },
        nutrition: {
          targets: target.data
            ? {
                energyKcal: Number(target.data.energy_kcal),
                proteinG: Number(target.data.protein_g),
                carbsG: Number(target.data.carbs_g),
                fatG: Number(target.data.fat_g),
                fiberG: Number(target.data.fiber_g),
              }
            : null,
          meanIntakeKcal: meanOf(dayTotals.map((day) => day.energyKcal)),
          meanProteinG: meanOf(dayTotals.map((day) => day.proteinG)),
          daysLogged: loggedDays.size,
          daysInWindow: COACH_HISTORY_DAYS,
          estimatedTdeeKcal: estimate?.estimatedTdeeKcal ?? null,
          tdeeConfidence: estimate?.confidence.overall ?? null,
        },
        body: {
          latestWeightKg: points[points.length - 1]?.weightKg ?? null,
          trendWeightKg: weightKg,
          weightChangeKgPerWeek: trend?.kgPerWeek ?? null,
          weighInCount: points.length,
        },
        training: {
          sessionsCompleted: (sessions.data ?? []).filter((s) => s.completed_at !== null).length,
          plannedPerWeek: preferences.data?.training_days_per_week ?? null,
          weeklySetsByMuscle,
          recentExercises,
        },
      }),
      isLoading: false,
    };
  }, [
    isLoading,
    today,
    profile.data,
    preferences.data,
    goal.data,
    target.data,
    weights.data,
    entries.data,
    sessions.data,
    exercises.data,
    volume.summary,
    estimate,
  ]);
}

export interface CoachState {
  messages: CoachMessage[];
  isAsking: boolean;
  error: string | null;
  isConfigured: boolean;
  isContextReady: boolean;
  ask: (question: string) => Promise<void>;
  reset: () => void;
}

export function useCoach(): CoachState {
  const provider = getCoachProvider();
  const { context, isLoading } = useCoachContext();

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (trimmed === '' || !context || isAsking) return;

      setError(null);
      setIsAsking(true);
      setMessages((current) => [...current, { role: 'user', content: trimmed }]);

      const history: CoachTurn[] = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const result = await provider.ask({ question: trimmed, context, history });
      setIsAsking(false);

      if (!result.ok) {
        setError(COACH_FAILURE_MESSAGES[result.failure]);
        return;
      }

      appendReply(setMessages, result.reply);
    },
    [context, isAsking, messages, provider],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isAsking,
    error,
    isConfigured: provider.isConfigured(),
    isContextReady: !isLoading && context !== null,
    ask,
    reset,
  };
}

function appendReply(
  setMessages: React.Dispatch<React.SetStateAction<CoachMessage[]>>,
  reply: CoachReply,
): void {
  setMessages((current) => [
    ...current,
    {
      role: 'assistant',
      content: reply.message,
      ...(reply.actions.length > 0 ? { actions: reply.actions } : {}),
    },
  ]);
}

/**
 * Perform a confirmed action.
 *
 * Every branch is something the user could already do by hand in two taps; the
 * coach only saves the taps. Navigation is handled by the caller, because a
 * mutation is the wrong place to move someone between screens.
 */
export function usePerformCoachAction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const target = useActiveTarget();

  return useMutation({
    mutationFn: async (action: CoachAction): Promise<void> => {
      if (!requiresConfirmation(action)) {
        if (action.type === 'open_screen') router.push(action.path as never);
        return;
      }

      const userId = user?.id as string;

      switch (action.type) {
        case 'log_weight':
          await upsertWeightLog(userId, action.date ?? todayIsoDate(), action.weightKg);
          return;

        case 'log_food': {
          // The id is validated by fetching it. A coach that names a food the
          // catalogue does not have gets an error, not an invented entry.
          const food = await fetchFoodById(action.foodId);
          if (!food) throw new Error('That food is not in your catalogue any more.');

          const nutrition = nutritionForGrams(
            {
              caloriesPer100g: Number(food.calories_per_100g),
              proteinPer100g: food.protein_per_100g === null ? null : Number(food.protein_per_100g),
              carbsPer100g: food.carbs_per_100g === null ? null : Number(food.carbs_per_100g),
              fatPer100g: food.fat_per_100g === null ? null : Number(food.fat_per_100g),
              fiberPer100g: food.fiber_per_100g === null ? null : Number(food.fiber_per_100g),
            },
            action.quantityG,
          );

          await createFoodEntry(userId, {
            loggedOn: todayIsoDate(),
            mealType: action.mealType,
            displayName: food.name,
            quantity: action.quantityG,
            unit: 'g',
            foodId: food.id,
            ...nutrition,
          });
          return;
        }

        case 'set_calorie_target': {
          // Macros are left where they are: the coach proposed an energy
          // figure, not a macro split, and silently recomputing three other
          // numbers is more than the user agreed to. The weekly check-in is
          // where a full target change belongs.
          if (!target.data) throw new Error('No active target to change');
          await setActiveTarget(userId, {
            energy_kcal: action.energyKcal,
            protein_g: Number(target.data.protein_g),
            carbs_g: Number(target.data.carbs_g),
            fat_g: Number(target.data.fat_g),
            fiber_g: Number(target.data.fiber_g),
            step_goal: target.data.step_goal,
            basis: { from: 'coach', reason: action.reason },
            source: 'manual',
          });
          return;
        }

        case 'swap_exercise':
        case 'add_meal_to_plan':
          // Proposed by the coach, but the screens that own these have their
          // own validation (equipment, allergens, plan structure). Sending the
          // user there with the change pre-filled is honest; writing it from
          // here would bypass rules that exist for a reason.
          router.push(action.type === 'swap_exercise' ? '/training' : '/nutrition/meal-plan');
          return;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['weight-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['food-entries'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activeTarget(user?.id ?? '') });
    },
  });
}
