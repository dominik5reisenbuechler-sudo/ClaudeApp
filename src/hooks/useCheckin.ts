import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { estimateBmr } from '@/domain/nutrition/energy';
import { computeMacroTargets } from '@/domain/nutrition/macros';
import { screenForSafety } from '@/domain/nutrition/safety';
import { estimateAdaptiveTdee } from '@/domain/nutrition/tdeeEstimator';
import type { IntakeDay, TdeeEstimate } from '@/domain/nutrition/tdeeEstimator';
import { averageAsOf } from '@/domain/nutrition/weightTrend';
import { assessRecovery, UNKNOWN_RECOVERY } from '@/domain/recommendations/recovery';
import type { RecoveryAnswers } from '@/domain/recommendations/recovery';
import {
  buildMuscleReviews,
  jointDiscomfortStreak,
  rpeRise,
  stallStreakWeeks,
  weeksBetween,
} from '@/domain/recommendations/reviewInputs';
import type { DeloadInput } from '@/domain/recommendations/trainingAdjustment';
import type { Recommendation } from '@/domain/recommendations/types';
import { reviewWeek } from '@/domain/recommendations/weeklyCheckin';
import type { CalorieAdjustmentInput } from '@/domain/recommendations/calorieAdjustment';
import {
  fetchCheckin,
  fetchEvidenceRules,
  fetchPendingRecommendations,
  fetchRecentCheckins,
  respondToRecommendation,
  saveCheckin,
  saveRecommendations,
} from '@/services/checkinService';
import type { CheckinAnswers } from '@/services/checkinService';
import { setActiveTarget } from '@/services/profileService';
import { toStrengthSets } from '@/services/trainingService';
import { useFoodEntriesInRange } from './useNutrition';
import { useWeightLogs } from './useLogs';
import { useActiveGoal, useActiveTarget, usePreferences, useProfile } from './useProfile';
import {
  useActivePlan,
  useContributionMap,
  useSessionHistory,
  useWeeklyVolume,
} from './useTraining';
import { queryKeys } from '@/lib/queryClient';
import type { Json, RecommendationRow } from '@/types/database';
import type { IsoDate, MuscleId, MusclePriority } from '@/types/domain';
import { addDays, ageOn, daysBetween, startOfIsoWeek, todayIsoDate } from '@/utils/date';

/**
 * The weekly check-in.
 *
 * Every input the engine needs is assembled here from queries that already
 * exist, converted by pure domain functions, and handed to `reviewWeek`. The
 * hook decides nothing: if it looks like a judgement is being made in this
 * file, it belongs in `src/domain/recommendations` instead.
 *
 * Nothing is written until the user submits the check-in. Opening the screen
 * shows a preview of what the engine would say, which is also what makes the
 * recommendations feel like advice rather than an edit.
 */

const CHECKIN_KEY = 'weekly-checkin';
const RECOMMENDATION_KEY = 'recommendations';

/** Enough history for a 28-day window plus the smoothing lead-in. */
const ANALYSIS_DAYS = 60;

export function useCheckin(weekStartDate: IsoDate) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [CHECKIN_KEY, userId ?? 'anonymous', weekStartDate],
    queryFn: () => fetchCheckin(userId as string, weekStartDate),
    enabled: Boolean(userId),
  });
}

export function useRecentCheckins(limit = 12) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [CHECKIN_KEY, userId ?? 'anonymous', 'recent', limit],
    queryFn: () => fetchRecentCheckins(userId as string, limit),
    enabled: Boolean(userId),
  });
}

/**
 * The adaptive TDEE estimate, measured from logged intake and the weight trend.
 *
 * Returns null while the underlying queries are still loading — a placeholder
 * estimate built from empty arrays would render as "not enough data" and read
 * as a verdict rather than a loading state.
 */
export function useTdeeEstimate(windowEnd: IsoDate = todayIsoDate()): {
  estimate: TdeeEstimate | null;
  isLoading: boolean;
} {
  const weights = useWeightLogs(ANALYSIS_DAYS, windowEnd);
  const entries = useFoodEntriesInRange(addDays(windowEnd, -(ANALYSIS_DAYS - 1)), windowEnd);
  const goal = useActiveGoal();

  const isLoading = weights.isLoading || entries.isLoading || goal.isLoading;

  return useMemo(() => {
    if (isLoading || !weights.data || !entries.data) return { estimate: null, isLoading };

    const byDay = new Map<IsoDate, number>();
    for (const entry of entries.data) {
      byDay.set(entry.logged_on, (byDay.get(entry.logged_on) ?? 0) + Number(entry.energy_kcal));
    }
    const intake: IntakeDay[] = [...byDay].map(([date, energyKcal]) => ({ date, energyKcal }));

    return {
      estimate: estimateAdaptiveTdee({
        weights: weights.data,
        intake,
        windowEnd,
        ...(goal.data?.started_on ? { phaseStartedOn: goal.data.started_on } : {}),
      }),
      isLoading: false,
    };
  }, [isLoading, weights.data, entries.data, goal.data, windowEnd]);
}

export interface WeeklyReview {
  recommendations: Recommendation[];
  computed: Json;
  estimate: TdeeEstimate | null;
  isLoading: boolean;
}

/**
 * What the engine would recommend for this week, given the answers so far.
 *
 * The answers are passed in rather than read from the database because the
 * preview updates as the user fills the form in — seeing the reasoning move
 * while answering is most of what makes the check-in worth doing.
 */
export function useWeeklyReview(
  weekStartDate: IsoDate,
  answers: RecoveryAnswers,
): WeeklyReview {
  const weekEnd = addDays(weekStartDate, 6);
  const today = todayIsoDate();
  const windowEnd = weekEnd < today ? weekEnd : today;

  const { estimate, isLoading: estimateLoading } = useTdeeEstimate(windowEnd);
  const profile = useProfile();
  const preferences = usePreferences();
  const goal = useActiveGoal();
  const target = useActiveTarget();
  const weights = useWeightLogs(ANALYSIS_DAYS, windowEnd);
  const volume = useWeeklyVolume();
  const history = useSessionHistory(60);
  const contributions = useContributionMap();
  const plan = useActivePlan();
  const checkins = useRecentCheckins(8);

  const isLoading =
    estimateLoading ||
    profile.isLoading ||
    preferences.isLoading ||
    goal.isLoading ||
    target.isLoading ||
    weights.isLoading ||
    volume.isLoading ||
    history.isLoading ||
    checkins.isLoading;

  return useMemo(() => {
    if (isLoading) {
      return { recommendations: [], computed: null, estimate, isLoading: true };
    }

    const recovery = assessRecovery(answers);
    const sets = toStrengthSets(history.data ?? []);

    // The smoothed weight, never a single reading — a recommendation built on
    // one morning's number is a recommendation built on hydration.
    const weightKg = averageAsOf(weights.data ?? [], windowEnd);

    const plannedPerWeek = preferences.data?.training_days_per_week ?? 4;
    const sessionsThisWeek = (history.data ?? []).filter(
      (session) =>
        session.completed_at !== null &&
        session.started_at.slice(0, 10) >= weekStartDate &&
        session.started_at.slice(0, 10) <= weekEnd,
    ).length;
    const adherenceRatio = Math.min(sessionsThisWeek / Math.max(plannedPerWeek, 1), 1);

    const muscles = buildMuscleReviews({
      volume: volume.summary,
      sets,
      contributions,
      priorities: (preferences.data?.muscle_priorities ?? {}) as Partial<
        Record<MuscleId, MusclePriority>
      >,
      recovery,
      adherenceRatio,
    });

    const deload: DeloadInput | null = plan.data
      ? {
          stalledWeeks: stallStreakWeeks(sets, windowEnd),
          rpeRise: rpeRise(
            (history.data ?? []).map((session) => ({
              date: session.started_at.slice(0, 10) as IsoDate,
              rpe: session.session_rpe === null ? null : Number(session.session_rpe),
            })),
            windowEnd,
          ),
          jointDiscomfortWeeks: jointDiscomfortStreak(
            (checkins.data ?? []).map((row) => ({
              weekStartDate: row.week_start_date,
              jointDiscomfort: row.joint_discomfort,
            })),
          ),
          recovery,
          weeksInBlock: weeksBetween(plan.data.started_on ?? weekStartDate, windowEnd),
          weeksSinceLastDeload: null,
        }
      : null;

    const calorie = buildCalorieInput({
      estimate,
      weightKg,
      profile: profile.data,
      preferences: preferences.data,
      goal: goal.data,
      target: target.data,
      windowEnd,
    });

    const result = reviewWeek({
      weekStartDate,
      answers,
      calorie,
      muscles,
      deload,
    });

    return {
      recommendations: result.recommendations,
      computed: result.computed as Json,
      estimate,
      isLoading: false,
    };
  }, [
    isLoading,
    answers,
    estimate,
    history.data,
    weights.data,
    preferences.data,
    profile.data,
    goal.data,
    target.data,
    volume.summary,
    contributions,
    plan.data,
    checkins.data,
    weekStartDate,
    weekEnd,
    windowEnd,
  ]);
}

/**
 * The calorie engine's inputs, or null when a piece is genuinely missing.
 *
 * Returning null rather than substituting defaults is the point: a calorie
 * recommendation built on a guessed bodyweight or a guessed BMR would look
 * exactly as authoritative as a real one.
 */
function buildCalorieInput(input: {
  estimate: TdeeEstimate | null;
  weightKg: number | null;
  profile: ReturnType<typeof useProfile>['data'];
  preferences: ReturnType<typeof usePreferences>['data'];
  goal: ReturnType<typeof useActiveGoal>['data'];
  target: ReturnType<typeof useActiveTarget>['data'];
  windowEnd: IsoDate;
}): CalorieAdjustmentInput | null {
  const { estimate, weightKg, profile, preferences, goal, target } = input;
  if (!estimate || weightKg === null || !profile || !goal || !target) return null;
  if (!profile.sex || !profile.height_cm || !profile.birth_date) return null;

  const ageYears = ageOn(profile.birth_date, input.windowEnd);
  const bmr = estimateBmr({
    sex: profile.sex,
    weightKg,
    heightCm: Number(profile.height_cm),
    ageYears,
  });

  const safetyFlags = screenForSafety({
    ageYears,
    sex: profile.sex,
    weightKg,
    heightCm: Number(profile.height_cm),
    isPregnantOrBreastfeeding: preferences?.is_pregnant_or_breastfeeding ?? false,
    hasMedicalCondition: preferences?.has_medical_condition ?? false,
    eatingDisorderRisk: preferences?.eating_disorder_risk ?? false,
    reportsAcuteSymptoms: preferences?.reports_acute_symptoms ?? false,
  });

  return {
    goal: goal.goal,
    currentTargetKcal: Number(target.energy_kcal),
    estimate,
    weightKg,
    sex: profile.sex,
    bmrKcal: bmr.bmrKcal,
    // Only a target the engine itself set counts as an adjustment — a manual
    // edit is the user's business and does not start our waiting period.
    daysSinceLastAdjustment:
      target.source === 'recommendation'
        ? Math.max(0, daysBetween(target.effective_from, input.windowEnd))
        : null,
    safetyFlags,
  };
}

/** Save the answers, then store what the engine made of them. */
export function useSubmitCheckin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      weekStartDate: IsoDate;
      answers: CheckinAnswers;
      computed: Json;
      recommendations: readonly Recommendation[];
    }) => {
      const checkin = await saveCheckin(
        user?.id as string,
        input.weekStartDate,
        input.answers,
        input.computed,
      );
      // Only actionable proposals are persisted. A "no change" is a real
      // answer but not a decision to record — storing it would fill the
      // history with rows nobody ever responds to.
      const actionable = input.recommendations.filter(
        (recommendation) =>
          recommendation.type !== 'no_change' && recommendation.type !== 'adherence',
      );
      const saved = await saveRecommendations(user?.id as string, checkin.id, actionable);
      return { checkin, recommendations: saved };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CHECKIN_KEY] });
      void queryClient.invalidateQueries({ queryKey: [RECOMMENDATION_KEY] });
    },
  });
}

export function usePendingRecommendations() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [RECOMMENDATION_KEY, userId ?? 'anonymous', 'pending'],
    queryFn: () => fetchPendingRecommendations(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Record the user's answer, and apply it when they accepted.
 *
 * Applying a calorie change writes a **new** `user_targets` row rather than
 * editing the current one: "why did my target change?" is only answerable if
 * the old value and its basis still exist. Macros are recomputed for the new
 * energy, because leaving yesterday's protein figure against a different
 * calorie number produces a target that does not add up.
 */
export function useRespondToRecommendation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const preferences = usePreferences();
  const goal = useActiveGoal();
  const target = useActiveTarget();
  const weights = useWeightLogs();

  return useMutation({
    mutationFn: async ({
      recommendation,
      status,
    }: {
      recommendation: RecommendationRow;
      status: 'accepted' | 'rejected';
    }) => {
      if (status === 'accepted' && recommendation.type === 'calorie_adjustment') {
        const suggested = recommendation.suggested_value as { energyKcal?: number } | null;
        const energyKcal = suggested?.energyKcal;
        const weightKg = averageAsOf(weights.data ?? [], todayIsoDate());

        if (typeof energyKcal === 'number' && weightKg !== null && goal.data && target.data) {
          const macros = computeMacroTargets({
            energyKcal,
            weightKg,
            goal: goal.data.goal,
            dietType: preferences.data?.diet_type ?? 'omnivore',
          });

          await setActiveTarget(user?.id as string, {
            energy_kcal: energyKcal,
            protein_g: macros.proteinG,
            carbs_g: macros.carbsG,
            fat_g: macros.fatG,
            fiber_g: macros.fiberG,
            step_goal: target.data.step_goal,
            basis: {
              from: 'weekly_checkin',
              recommendationId: recommendation.id,
              previousEnergyKcal: Number(target.data.energy_kcal),
              reason: recommendation.reason,
              weightKg,
            } as Json,
            source: 'recommendation',
          });
        }
      }

      return respondToRecommendation(
        user?.id as string,
        recommendation.id,
        status,
        new Date().toISOString(),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RECOMMENDATION_KEY] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activeTarget(user?.id ?? '') });
    },
  });
}

/** The evidence behind a recommendation, for the "why?" sheet. */
export function useEvidenceRules(ruleKeys: readonly string[]) {
  const keys = [...ruleKeys].sort();

  return useQuery({
    queryKey: ['evidence-rules', keys.join(',')],
    queryFn: () => fetchEvidenceRules(keys),
    enabled: keys.length > 0,
    staleTime: 60 * 60_000,
  });
}

/** Monday of the week a check-in covers. Check-ins review the week just gone. */
export function currentCheckinWeek(today: IsoDate = todayIsoDate()): IsoDate {
  return addDays(startOfIsoWeek(today), -7);
}

export { UNKNOWN_RECOVERY };
