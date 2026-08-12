import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { totalsFor } from '@/domain/nutrition/dailyTotals';
import {
  achievementStatuses,
  detectUnlocks,
  EMPTY_PROGRESS,
} from '@/domain/gamification/achievements';
import type { AchievementProgress } from '@/domain/gamification/achievements';
import {
  computeStreak,
  dailyTargetStatuses,
  mealPlanWeekStatuses,
  trainingDayStatuses,
  trainingWeekStatuses,
  EMPTY_STREAK,
} from '@/domain/gamification/streaks';
import type { StreakResult } from '@/domain/gamification/streaks';
import {
  levelProgress,
  xpForDay,
  CALORIE_BAND_PERCENT,
  PROTEIN_TARGET_FRACTION,
} from '@/domain/gamification/xp';
import type { DayForXp, XpEvent } from '@/domain/gamification/xp';
import {
  awardXp,
  fetchAchievements,
  fetchTotalXp,
  fetchUserAchievements,
  fetchXpEvents,
  recordUnlocks,
} from '@/services/gamificationService';
import { fetchPlannedWeekStarts } from '@/services/mealPlanService';
import { useRecentCheckins } from './useCheckin';
import { useStepLogs, useWeightLogs } from './useLogs';
import { useFoodEntriesInRange } from './useNutrition';
import { usePersonalRecords } from './useProgress';
import { useActiveTarget, usePreferences } from './useProfile';
import { useSessionHistory } from './useTraining';
import { toLoggedEntries } from '@/services/foodEntryService';
import type { IsoDate, StreakKind } from '@/types/domain';
import { addDays, startOfIsoWeek, todayIsoDate } from '@/utils/date';

/**
 * XP, streaks and achievements.
 *
 * Streaks are computed here from logs the app has already fetched, and are not
 * stored anywhere. XP and unlocks *are* stored, because they are records of
 * moments rather than summaries: deleting a food entry from March should not
 * quietly take back the points it earned at the time.
 *
 * The award pass runs when the dashboard mounts. It is safe to run repeatedly
 * — `xpForDay` is deterministic and the database rejects duplicates — so there
 * is no "have we already awarded today?" flag to get wrong.
 */

const XP_KEY = 'xp';
const ACHIEVEMENT_KEY = 'achievements';

/** How far back streaks and the award pass look. */
export const GAMIFICATION_WINDOW_DAYS = 120;

/** Days the award pass revisits, so a backdated log still earns its points. */
const AWARD_LOOKBACK_DAYS = 7;

export function useTotalXp() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [XP_KEY, userId ?? 'anonymous', 'total'],
    queryFn: () => fetchTotalXp(userId as string),
    enabled: Boolean(userId),
  });
}

export function useRecentXpEvents(days = 30) {
  const { user } = useAuth();
  const userId = user?.id;
  const from = addDays(todayIsoDate(), -(days - 1));

  return useQuery({
    queryKey: [XP_KEY, userId ?? 'anonymous', 'events', from],
    queryFn: () => fetchXpEvents(userId as string, from),
    enabled: Boolean(userId),
  });
}

export function useLevel() {
  const total = useTotalXp();

  return useMemo(
    () => ({
      totalXp: total.data ?? 0,
      progress: levelProgress(total.data ?? 0),
      isLoading: total.isLoading,
    }),
    [total.data, total.isLoading],
  );
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

export interface StreakSummary {
  kind: StreakKind;
  label: string;
  result: StreakResult;
  /** True when the streak counts weeks rather than days. */
  isWeekly: boolean;
}

export const STREAK_LABELS: Record<StreakKind, string> = {
  training: 'Training',
  nutrition: 'Calories',
  protein: 'Protein',
  steps: 'Steps',
  meal_planning: 'Meal plans',
};

/**
 * All five streaks.
 *
 * The training one is the only interesting case: with the user's scheduled
 * training days known, rest days are excused and the streak counts days. Without
 * them we cannot tell a rest day from a skipped one, so it falls back to
 * counting *weeks* that met the planned session count — a weaker claim, made
 * honestly, rather than a daily number that would either never break or break
 * every weekend.
 */
export function useStreaks(): { streaks: StreakSummary[]; isLoading: boolean } {
  const { user } = useAuth();
  const userId = user?.id;
  const today = todayIsoDate();
  const from = addDays(today, -(GAMIFICATION_WINDOW_DAYS - 1));
  const thisWeek = startOfIsoWeek(today);

  const sessions = useSessionHistory(120);
  const preferences = usePreferences();
  const target = useActiveTarget();
  const entries = useFoodEntriesInRange(from, today);
  const steps = useStepLogs(GAMIFICATION_WINDOW_DAYS, today);

  const plans = useQuery({
    queryKey: ['meal-plan-weeks', userId ?? 'anonymous', from],
    queryFn: () => fetchPlannedWeekStarts(userId as string, from),
    enabled: Boolean(userId),
  });

  const isLoading =
    sessions.isLoading ||
    preferences.isLoading ||
    target.isLoading ||
    entries.isLoading ||
    steps.isLoading ||
    plans.isLoading;

  return useMemo(() => {
    if (isLoading) {
      return {
        streaks: (Object.keys(STREAK_LABELS) as StreakKind[]).map((kind) => ({
          kind,
          label: STREAK_LABELS[kind],
          result: EMPTY_STREAK,
          isWeekly: kind === 'meal_planning',
        })),
        isLoading: true,
      };
    }

    const sessionDates = (sessions.data ?? [])
      .filter((session) => session.completed_at !== null)
      .map((session) => session.started_at.slice(0, 10) as IsoDate);

    const scheduledWeekdays = preferences.data?.preferred_training_days ?? [];
    const trainingIsWeekly = scheduledWeekdays.length === 0;

    const training = trainingIsWeekly
      ? computeStreak(
          trainingWeekStatuses({
            sessionDates,
            sessionsPerWeek: preferences.data?.training_days_per_week ?? 3,
            fromWeekStart: startOfIsoWeek(from),
            toWeekStart: thisWeek,
          }),
          { today: thisWeek, stepDays: 7 },
        )
      : computeStreak(trainingDayStatuses({ sessionDates, scheduledWeekdays, from, to: today }), {
          today,
        });

    const byDay = dailyNutrition(entries.data ?? []);
    const targetKcal = Number(target.data?.energy_kcal ?? 0);
    const targetProtein = Number(target.data?.protein_g ?? 0);
    const stepGoal = target.data?.step_goal ?? 8000;

    const calorieDates: IsoDate[] = [];
    const proteinDates: IsoDate[] = [];
    for (const [date, totals] of byDay) {
      if (targetKcal > 0) {
        const tolerance = (targetKcal * CALORIE_BAND_PERCENT) / 100;
        if (Math.abs(totals.energyKcal - targetKcal) <= tolerance) calorieDates.push(date);
      }
      if (targetProtein > 0 && totals.proteinG >= targetProtein * PROTEIN_TARGET_FRACTION) {
        proteinDates.push(date);
      }
    }

    const stepDates = (steps.data ?? [])
      .filter((point) => point.steps >= stepGoal)
      .map((point) => point.date);

    return {
      streaks: [
        {
          kind: 'training' as const,
          label: STREAK_LABELS.training,
          result: training,
          isWeekly: trainingIsWeekly,
        },
        {
          kind: 'nutrition' as const,
          label: STREAK_LABELS.nutrition,
          result: computeStreak(dailyTargetStatuses({ qualifyingDates: calorieDates, from, to: today }), { today }),
          isWeekly: false,
        },
        {
          kind: 'protein' as const,
          label: STREAK_LABELS.protein,
          result: computeStreak(dailyTargetStatuses({ qualifyingDates: proteinDates, from, to: today }), { today }),
          isWeekly: false,
        },
        {
          kind: 'steps' as const,
          label: STREAK_LABELS.steps,
          result: computeStreak(dailyTargetStatuses({ qualifyingDates: stepDates, from, to: today }), { today }),
          isWeekly: false,
        },
        {
          kind: 'meal_planning' as const,
          label: STREAK_LABELS.meal_planning,
          result: computeStreak(
            mealPlanWeekStatuses({
              plannedWeekStarts: plans.data ?? [],
              fromWeekStart: startOfIsoWeek(from),
              toWeekStart: thisWeek,
            }),
            { today: thisWeek, stepDays: 7 },
          ),
          isWeekly: true,
        },
      ],
      isLoading: false,
    };
  }, [
    isLoading,
    sessions.data,
    preferences.data,
    target.data,
    entries.data,
    steps.data,
    plans.data,
    from,
    today,
    thisWeek,
  ]);
}

interface DayTotals {
  energyKcal: number;
  proteinG: number;
}

/** Per-day energy and protein from logged entries. */
function dailyNutrition(
  entries: readonly Parameters<typeof toLoggedEntries>[0][number][],
): Map<IsoDate, DayTotals> {
  const byDate = new Map<IsoDate, typeof entries>();
  for (const entry of entries) {
    const date = entry.logged_on;
    byDate.set(date, [...(byDate.get(date) ?? []), entry]);
  }

  const totals = new Map<IsoDate, DayTotals>();
  for (const [date, dayEntries] of byDate) {
    const day = totalsFor(toLoggedEntries(dayEntries));
    totals.set(date, { energyKcal: day.energyKcal, proteinG: day.proteinG });
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export function useAchievementCatalogue() {
  return useQuery({
    queryKey: [ACHIEVEMENT_KEY, 'catalogue'],
    queryFn: fetchAchievements,
    staleTime: 60 * 60_000,
  });
}

export function useUserAchievements() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: [ACHIEVEMENT_KEY, userId ?? 'anonymous'],
    queryFn: () => fetchUserAchievements(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Current value of every metric achievements threshold on.
 *
 * Assembled from the same queries the rest of the app uses, so a progress bar
 * on an achievement and the number on the dashboard can never disagree.
 */
export function useAchievementProgress(): { progress: AchievementProgress; isLoading: boolean } {
  const { streaks, isLoading: streaksLoading } = useStreaks();
  const sessions = useSessionHistory(200);
  const records = usePersonalRecords();
  const weights = useWeightLogs(365);
  const checkins = useRecentCheckins(52);
  const total = useTotalXp();
  const entries = useFoodEntriesInRange(
    addDays(todayIsoDate(), -364),
    todayIsoDate(),
  );

  const isLoading =
    streaksLoading ||
    sessions.isLoading ||
    weights.isLoading ||
    checkins.isLoading ||
    total.isLoading ||
    entries.isLoading;

  return useMemo(() => {
    const streakOf = (kind: StreakKind): number =>
      streaks.find((streak) => streak.kind === kind)?.result.longest ?? 0;

    const loggedDays = new Set((entries.data ?? []).map((entry) => entry.logged_on));
    const cooked = (entries.data ?? []).filter((entry) => entry.recipe_id !== null).length;

    return {
      progress: {
        ...EMPTY_PROGRESS,
        workouts_completed: (sessions.data ?? []).filter((s) => s.completed_at !== null).length,
        training_streak: streakOf('training'),
        nutrition_streak: streakOf('nutrition'),
        protein_streak: streakOf('protein'),
        steps_streak: streakOf('steps'),
        meal_planning_streak: streakOf('meal_planning'),
        days_logged: loggedDays.size,
        weigh_ins: (weights.data ?? []).length,
        personal_records: (records.data ?? []).length,
        checkins_completed: (checkins.data ?? []).length,
        recipes_cooked: cooked,
        total_xp: total.data ?? 0,
      },
      isLoading,
    };
  }, [
    isLoading,
    streaks,
    sessions.data,
    records.data,
    weights.data,
    checkins.data,
    total.data,
    entries.data,
  ]);
}

export function useAchievements() {
  const { progress, isLoading } = useAchievementProgress();
  const unlocked = useUserAchievements();

  return useMemo(() => {
    const map = new Map(
      (unlocked.data ?? []).map((row) => [row.achievement_id, row.unlocked_on as IsoDate]),
    );

    return {
      statuses: achievementStatuses(progress, map),
      unlockedCount: map.size,
      isLoading: isLoading || unlocked.isLoading,
    };
  }, [progress, unlocked.data, unlocked.isLoading, isLoading]);
}

// ---------------------------------------------------------------------------
// The award pass
// ---------------------------------------------------------------------------

/**
 * Award XP for recent days and record any achievements that have come true.
 *
 * Runs on mount and does nothing when there is nothing to add. The lookback
 * exists because logs arrive late: someone entering yesterday's dinner this
 * morning should still get yesterday's points.
 */
export function useAwardPass(): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = todayIsoDate();
  const from = addDays(today, -(AWARD_LOOKBACK_DAYS - 1));

  const target = useActiveTarget();
  const sessions = useSessionHistory(30);
  const weights = useWeightLogs(AWARD_LOOKBACK_DAYS, today);
  const steps = useStepLogs(AWARD_LOOKBACK_DAYS, today);
  const entries = useFoodEntriesInRange(from, today);
  const checkins = useRecentCheckins(4);

  const { progress, isLoading: progressLoading } = useAchievementProgress();
  const unlocked = useUserAchievements();

  const award = useMutation({
    mutationFn: async (input: {
      events: XpEvent[];
      checkinWeeks: IsoDate[];
    }) => {
      await awardXp(user?.id as string, input.events);
      await awardXp(
        user?.id as string,
        input.checkinWeeks.map((week) => ({
          kind: 'checkin_completed' as const,
          xp: 60,
          earnedOn: week,
          context: { weekStartDate: week },
        })),
      );

      const newUnlocks = detectUnlocks(
        progress,
        new Set((unlocked.data ?? []).map((row) => row.achievement_id)),
        today,
      );
      await recordUnlocks(user?.id as string, newUnlocks);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [XP_KEY] });
      void queryClient.invalidateQueries({ queryKey: [ACHIEVEMENT_KEY] });
    },
  });

  const ready =
    Boolean(user) &&
    Boolean(target.data) &&
    !progressLoading &&
    !unlocked.isLoading &&
    !sessions.isLoading &&
    !weights.isLoading &&
    !steps.isLoading &&
    !entries.isLoading &&
    !checkins.isLoading;

  const payload = useMemo(() => {
    if (!ready || !target.data) return null;

    const nutrition = dailyNutrition(entries.data ?? []);
    const weighed = new Set((weights.data ?? []).map((point) => point.date));
    const stepsByDay = new Map((steps.data ?? []).map((point) => [point.date, point.steps]));

    const sessionsByDay = new Map<IsoDate, number>();
    for (const session of sessions.data ?? []) {
      if (session.completed_at === null) continue;
      const date = session.started_at.slice(0, 10) as IsoDate;
      sessionsByDay.set(date, (sessionsByDay.get(date) ?? 0) + 1);
    }

    const events: XpEvent[] = [];
    for (let index = 0; index < AWARD_LOOKBACK_DAYS; index += 1) {
      const date = addDays(from, index);
      const totals = nutrition.get(date) ?? null;

      const day: DayForXp = {
        date,
        energyKcal: totals?.energyKcal ?? null,
        proteinG: totals?.proteinG ?? null,
        steps: stepsByDay.get(date) ?? null,
        weightLogged: weighed.has(date),
        workoutsCompleted: sessionsByDay.get(date) ?? 0,
        targets: {
          energyKcal: Number(target.data?.energy_kcal ?? 0),
          proteinG: Number(target.data?.protein_g ?? 0),
          stepGoal: target.data?.step_goal ?? 8000,
        },
      };

      events.push(...xpForDay(day));
    }

    const checkinWeeks = (checkins.data ?? [])
      .map((row) => row.week_start_date)
      .filter((week) => week >= from);

    return { events, checkinWeeks };
  }, [
    ready,
    target.data,
    entries.data,
    weights.data,
    steps.data,
    sessions.data,
    checkins.data,
    from,
  ]);

  const hasWork = (payload?.events.length ?? 0) > 0 || (payload?.checkinWeeks.length ?? 0) > 0;

  useEffect(() => {
    if (!payload || !hasWork || award.isPending) return;
    award.mutate(payload);
    // The mutation is idempotent, so re-running it is harmless; keying the
    // effect on the payload rather than the mutation keeps it from looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, hasWork]);
}
