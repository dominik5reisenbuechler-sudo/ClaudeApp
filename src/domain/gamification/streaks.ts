/**
 * Streaks.
 *
 * Two decisions carry most of the weight here, and both are about not
 * punishing the user for following the plan:
 *
 * **A scheduled rest day never breaks a training streak.** A streak that
 * resets because someone took the rest day their programme prescribed is
 * actively harmful: it rewards junk volume and it is the single most common way
 * a fitness app teaches people to overtrain. Rest days are `excused` — they
 * neither extend the streak nor end it.
 *
 * **Today is pending, not missed.** At nine in the morning nobody has hit their
 * calorie target yet. A streak that reads 0 at breakfast and 14 at dinner is
 * measuring the clock, not the habit, so an unqualified *today* leaves the
 * streak standing and is reported separately.
 *
 * Streaks are derived from logs, never stored as the source of truth. The
 * `streaks` table is a cache; if it is wrong, it is rebuilt from the logs.
 */

import { addDays, daysBetween, isoWeekday } from '@/utils/date';
import type { IsoDate } from '@/types/domain';

export type DayStatus =
  /** The day's condition was met. */
  | 'qualified'
  /** The day's condition was not met, and it counted. */
  | 'missed'
  /** The day did not count either way — a scheduled rest day. */
  | 'excused';

export interface StreakDay {
  date: IsoDate;
  status: DayStatus;
}

export interface StreakOptions {
  /** The last period the streak may count. Normally today. */
  today: IsoDate;
  /**
   * Days between periods. 1 for a daily streak; 7 for a weekly one, where
   * `today` is the Monday of the current week.
   */
  stepDays?: number;
}

export interface StreakResult {
  current: number;
  longest: number;
  lastQualifyingDate: IsoDate | null;
  /**
   * True when the current period has not qualified yet but the streak is still
   * alive. The UI should say "keep it going", not "you lost it".
   */
  isPendingToday: boolean;
}

export const EMPTY_STREAK: StreakResult = {
  current: 0,
  longest: 0,
  lastQualifyingDate: null,
  isPendingToday: false,
};

/**
 * Current and longest streak over the supplied periods.
 *
 * The caller supplies a status for every period it is asserting about. Periods
 * inside that range but absent from the list are treated as missed; periods
 * before the earliest supplied one are *unknown*, and the walk stops there
 * rather than guessing.
 */
export function computeStreak(
  days: readonly StreakDay[],
  options: StreakOptions,
): StreakResult {
  const step = options.stepDays ?? 1;
  if (days.length === 0) return EMPTY_STREAK;

  const byDate = new Map<IsoDate, DayStatus>();
  for (const day of days) byDate.set(day.date, day.status);

  const earliest = days.reduce(
    (min, day) => (day.date < min ? day.date : min),
    days[0]?.date as IsoDate,
  );

  // --- Current streak, walking back from today ---------------------------

  let current = 0;
  let lastQualifyingDate: IsoDate | null = null;
  let isPendingToday = false;

  let cursor = options.today;
  const todayStatus = byDate.get(options.today) ?? 'missed';
  if (todayStatus === 'missed') {
    // Not a break — the day is not over. Judge the streak from the last
    // period that has actually finished.
    isPendingToday = true;
    cursor = addDays(cursor, -step);
  }

  while (cursor >= earliest) {
    const status = byDate.get(cursor) ?? 'missed';
    if (status === 'missed') break;
    if (status === 'qualified') {
      current += 1;
      if (lastQualifyingDate === null) lastQualifyingDate = cursor;
    }
    cursor = addDays(cursor, -step);
  }

  // --- Longest streak, scanning the whole series -------------------------

  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  let longest = 0;
  let run = 0;
  let previous: IsoDate | null = null;

  for (const day of ordered) {
    // A gap in the supplied periods is unknown, so the run cannot continue
    // across it — we would be asserting something we were not told.
    if (previous !== null && daysBetween(previous, day.date) !== step) run = 0;
    previous = day.date;

    if (day.status === 'qualified') {
      run += 1;
      longest = Math.max(longest, run);
    } else if (day.status === 'missed') {
      run = 0;
    }
    // `excused` bridges without adding.
  }

  return {
    current,
    longest: Math.max(longest, current),
    lastQualifyingDate,
    isPendingToday: isPendingToday && current > 0,
  };
}

// ---------------------------------------------------------------------------
// Building day statuses from logs
// ---------------------------------------------------------------------------

/** Every date from `from` to `to`, inclusive. */
function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const total = daysBetween(from, to);
  if (total < 0) return [];
  return Array.from({ length: total + 1 }, (_, index) => addDays(from, index));
}

export interface TrainingStreakInput {
  /** Dates with a completed session. */
  sessionDates: readonly IsoDate[];
  /** ISO weekdays the user planned to train, 1 = Monday. May be empty. */
  scheduledWeekdays: readonly number[];
  from: IsoDate;
  to: IsoDate;
}

/**
 * Training days, with rest days excused.
 *
 * A day the user trained qualifies even if it was not scheduled — training on
 * a rest day is not a failure. A scheduled day with no session is a miss. Any
 * other day is excused.
 */
export function trainingDayStatuses(input: TrainingStreakInput): StreakDay[] {
  const trained = new Set(input.sessionDates);
  const scheduled = new Set(input.scheduledWeekdays);

  return eachDay(input.from, input.to).map((date) => ({
    date,
    status: trained.has(date)
      ? ('qualified' as const)
      : scheduled.has(isoWeekday(date))
        ? ('missed' as const)
        : ('excused' as const),
  }));
}

/**
 * The weekly fallback, for a user who never told us which days they train.
 *
 * Without scheduled days we cannot tell a rest day from a skipped one, and
 * guessing would either break streaks on legitimate rest days or never break
 * them at all. So the streak drops to a weekly cadence instead: a week
 * qualifies when the planned number of sessions was completed. Less
 * satisfying, and honest about what we know.
 */
export function trainingWeekStatuses(input: {
  sessionDates: readonly IsoDate[];
  sessionsPerWeek: number;
  /** Monday of the earliest week to consider. */
  fromWeekStart: IsoDate;
  /** Monday of the current week. */
  toWeekStart: IsoDate;
}): StreakDay[] {
  const weeks: StreakDay[] = [];
  const target = Math.max(1, input.sessionsPerWeek);

  for (
    let week = input.fromWeekStart;
    week <= input.toWeekStart;
    week = addDays(week, 7)
  ) {
    const weekEnd = addDays(week, 6);
    const completed = input.sessionDates.filter(
      (date) => date >= week && date <= weekEnd,
    ).length;

    weeks.push({ date: week, status: completed >= target ? 'qualified' : 'missed' });
  }

  return weeks;
}

/**
 * Statuses for a daily target that is met or not — calories, protein, steps.
 *
 * Days with no data at all are missed rather than excused: not logging is how
 * these streaks are actually broken, and excusing it would produce a streak
 * that only ever grows.
 */
export function dailyTargetStatuses(input: {
  qualifyingDates: readonly IsoDate[];
  from: IsoDate;
  to: IsoDate;
}): StreakDay[] {
  const met = new Set(input.qualifyingDates);
  return eachDay(input.from, input.to).map((date) => ({
    date,
    status: met.has(date) ? ('qualified' as const) : ('missed' as const),
  }));
}

/** Weeks in which a meal plan existed, as a weekly-cadence status list. */
export function mealPlanWeekStatuses(input: {
  plannedWeekStarts: readonly IsoDate[];
  fromWeekStart: IsoDate;
  toWeekStart: IsoDate;
}): StreakDay[] {
  const planned = new Set(input.plannedWeekStarts);
  const weeks: StreakDay[] = [];

  for (
    let week = input.fromWeekStart;
    week <= input.toWeekStart;
    week = addDays(week, 7)
  ) {
    weeks.push({ date: week, status: planned.has(week) ? 'qualified' : 'missed' });
  }

  return weeks;
}
