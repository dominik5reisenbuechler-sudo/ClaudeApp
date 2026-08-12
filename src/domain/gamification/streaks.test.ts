import { describe, expect, it } from 'vitest';

import {
  computeStreak,
  dailyTargetStatuses,
  mealPlanWeekStatuses,
  trainingDayStatuses,
  trainingWeekStatuses,
  EMPTY_STREAK,
} from './streaks';
import type { StreakDay } from './streaks';
import { addDays } from '@/utils/date';

const TODAY = '2025-06-22'; // a Sunday
const MONDAY = '2025-06-16';

/** Statuses for the `days` days ending today, newest last. */
function series(statuses: readonly StreakDay['status'][], today = TODAY): StreakDay[] {
  return statuses.map((status, index) => ({
    date: addDays(today, -(statuses.length - 1 - index)),
    status,
  }));
}

describe('computeStreak — the basics', () => {
  it('counts an unbroken run', () => {
    const result = computeStreak(series(['qualified', 'qualified', 'qualified']), {
      today: TODAY,
    });

    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
    expect(result.lastQualifyingDate).toBe(TODAY);
  });

  it('stops at a missed day', () => {
    const result = computeStreak(
      series(['qualified', 'qualified', 'missed', 'qualified', 'qualified']),
      { today: TODAY },
    );

    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });

  it('remembers the longest run even after it is broken', () => {
    const result = computeStreak(
      series(['qualified', 'qualified', 'qualified', 'qualified', 'missed', 'qualified']),
      { today: TODAY },
    );

    expect(result.current).toBe(1);
    expect(result.longest).toBe(4);
  });

  it('returns nothing for no data', () => {
    expect(computeStreak([], { today: TODAY })).toEqual(EMPTY_STREAK);
  });

  it('stops at the edge of what it was told, rather than assuming a miss', () => {
    // Three qualified days and nothing before them: the streak is 3, not
    // "3 and then presumably broken".
    const result = computeStreak(series(['qualified', 'qualified', 'qualified']), {
      today: TODAY,
    });

    expect(result.current).toBe(3);
  });
});

describe('computeStreak — today is pending, not missed', () => {
  it('keeps the streak alive when today has not qualified yet', () => {
    const result = computeStreak(series(['qualified', 'qualified', 'qualified', 'missed']), {
      today: TODAY,
    });

    expect(result.current).toBe(3);
    expect(result.isPendingToday).toBe(true);
    expect(result.lastQualifyingDate).toBe(addDays(TODAY, -1));
  });

  it('does not claim a pending day when there is no streak to keep', () => {
    const result = computeStreak(series(['missed', 'missed', 'missed']), { today: TODAY });

    expect(result.current).toBe(0);
    expect(result.isPendingToday).toBe(false);
  });

  it('is not pending once today qualifies', () => {
    const result = computeStreak(series(['qualified', 'qualified']), { today: TODAY });
    expect(result.isPendingToday).toBe(false);
  });

  it('still breaks on yesterday — pending forgives today only', () => {
    const result = computeStreak(
      series(['qualified', 'qualified', 'missed', 'missed']),
      { today: TODAY },
    );

    expect(result.current).toBe(0);
  });
});

describe('computeStreak — excused days bridge without adding', () => {
  it('carries the streak across an excused day', () => {
    const result = computeStreak(
      series(['qualified', 'excused', 'qualified', 'excused', 'qualified']),
      { today: TODAY },
    );

    // Three training days, two rest days. The streak is the training.
    expect(result.current).toBe(3);
  });

  it('does not let excused days inflate the count', () => {
    const result = computeStreak(series(['qualified', 'excused', 'excused', 'excused']), {
      today: TODAY,
    });

    expect(result.current).toBe(1);
  });

  it('handles an excused day as today without calling it pending', () => {
    const result = computeStreak(series(['qualified', 'qualified', 'excused']), {
      today: TODAY,
    });

    expect(result.current).toBe(2);
    expect(result.isPendingToday).toBe(false);
  });
});

describe('computeStreak — weekly cadence', () => {
  it('steps a week at a time', () => {
    const weeks: StreakDay[] = [
      { date: addDays(MONDAY, -21), status: 'qualified' },
      { date: addDays(MONDAY, -14), status: 'qualified' },
      { date: addDays(MONDAY, -7), status: 'qualified' },
      { date: MONDAY, status: 'qualified' },
    ];

    const result = computeStreak(weeks, { today: MONDAY, stepDays: 7 });
    expect(result.current).toBe(4);
  });

  it('treats the current week as pending', () => {
    const weeks: StreakDay[] = [
      { date: addDays(MONDAY, -14), status: 'qualified' },
      { date: addDays(MONDAY, -7), status: 'qualified' },
      { date: MONDAY, status: 'missed' },
    ];

    const result = computeStreak(weeks, { today: MONDAY, stepDays: 7 });
    expect(result.current).toBe(2);
    expect(result.isPendingToday).toBe(true);
  });
});

describe('trainingDayStatuses — rest days never break a streak', () => {
  const from = addDays(TODAY, -6);

  it('excuses days that were never scheduled', () => {
    // Trains Monday, Wednesday, Friday; the week runs Mon–Sun.
    const statuses = trainingDayStatuses({
      sessionDates: ['2025-06-16', '2025-06-18', '2025-06-20'],
      scheduledWeekdays: [1, 3, 5],
      from,
      to: TODAY,
    });

    expect(statuses.filter((day) => day.status === 'qualified')).toHaveLength(3);
    expect(statuses.filter((day) => day.status === 'excused')).toHaveLength(4);
    expect(statuses.filter((day) => day.status === 'missed')).toHaveLength(0);
  });

  it('gives a full streak to someone who followed a 3-day plan exactly', () => {
    const statuses = trainingDayStatuses({
      sessionDates: ['2025-06-16', '2025-06-18', '2025-06-20'],
      scheduledWeekdays: [1, 3, 5],
      from,
      to: TODAY,
    });

    expect(computeStreak(statuses, { today: TODAY }).current).toBe(3);
  });

  it('counts a skipped scheduled day as a miss', () => {
    const statuses = trainingDayStatuses({
      sessionDates: ['2025-06-16', '2025-06-20'],
      scheduledWeekdays: [1, 3, 5],
      from,
      to: TODAY,
    });

    // Wednesday was scheduled and skipped.
    expect(statuses.find((day) => day.date === '2025-06-18')?.status).toBe('missed');
    expect(computeStreak(statuses, { today: TODAY }).current).toBe(1);
  });

  it('counts an unscheduled session as training, not as a rule break', () => {
    const statuses = trainingDayStatuses({
      sessionDates: ['2025-06-17'],
      scheduledWeekdays: [1, 3, 5],
      from,
      to: TODAY,
    });

    expect(statuses.find((day) => day.date === '2025-06-17')?.status).toBe('qualified');
  });
});

describe('trainingWeekStatuses — the fallback when rest days are unknown', () => {
  it('qualifies a week that met the planned session count', () => {
    const weeks = trainingWeekStatuses({
      sessionDates: ['2025-06-16', '2025-06-18', '2025-06-20'],
      sessionsPerWeek: 3,
      fromWeekStart: MONDAY,
      toWeekStart: MONDAY,
    });

    expect(weeks).toEqual([{ date: MONDAY, status: 'qualified' }]);
  });

  it('misses a week that fell short', () => {
    const weeks = trainingWeekStatuses({
      sessionDates: ['2025-06-16', '2025-06-18'],
      sessionsPerWeek: 3,
      fromWeekStart: MONDAY,
      toWeekStart: MONDAY,
    });

    expect(weeks[0]?.status).toBe('missed');
  });

  it('never demands zero sessions a week', () => {
    const weeks = trainingWeekStatuses({
      sessionDates: [],
      sessionsPerWeek: 0,
      fromWeekStart: MONDAY,
      toWeekStart: MONDAY,
    });

    expect(weeks[0]?.status).toBe('missed');
  });
});

describe('dailyTargetStatuses', () => {
  it('treats a day with no data as missed, not excused', () => {
    const statuses = dailyTargetStatuses({
      qualifyingDates: ['2025-06-21'],
      from: '2025-06-20',
      to: '2025-06-22',
    });

    expect(statuses.map((day) => day.status)).toEqual(['missed', 'qualified', 'missed']);
  });
});

describe('mealPlanWeekStatuses', () => {
  it('marks weeks with a plan', () => {
    const weeks = mealPlanWeekStatuses({
      plannedWeekStarts: [MONDAY, addDays(MONDAY, -14)],
      fromWeekStart: addDays(MONDAY, -14),
      toWeekStart: MONDAY,
    });

    expect(weeks.map((week) => week.status)).toEqual(['qualified', 'missed', 'qualified']);
  });

  it('gives a streak of one when only this week is planned', () => {
    const weeks = mealPlanWeekStatuses({
      plannedWeekStarts: [MONDAY],
      fromWeekStart: addDays(MONDAY, -14),
      toWeekStart: MONDAY,
    });

    expect(computeStreak(weeks, { today: MONDAY, stepDays: 7 }).current).toBe(1);
  });
});
