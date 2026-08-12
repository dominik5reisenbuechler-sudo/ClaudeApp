import { describe, expect, it } from 'vitest';

import {
  sessionsPerWeek,
  summarizeConsistency,
  summarizeLoggingConsistency,
} from './consistency';
import type { SessionRecord } from './consistency';
import { addDays } from '@/utils/date';

const END = '2025-06-29';

/** `count` completed sessions, one per day, ending on `END`. */
function sessions(count: number, completed = true): SessionRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    date: addDays(END, -index),
    completed,
  }));
}

describe('summarizeConsistency', () => {
  it('measures against what the user planned, not an ideal', () => {
    // 12 sessions in 4 weeks against a plan of 3/week is 100%, not 60% of 5.
    const summary = summarizeConsistency(sessions(12), 3, END);

    expect(summary.sessionsPlanned).toBe(12);
    expect(summary.sessionsCompleted).toBe(12);
    expect(summary.adherencePercent).toBe(100);
  });

  it('reports partial adherence', () => {
    const summary = summarizeConsistency(sessions(9), 3, END);
    expect(summary.adherencePercent).toBe(75);
  });

  it('caps at 100 — an extra session is a bonus, not 125% adherence', () => {
    const summary = summarizeConsistency(sessions(20), 3, END);
    expect(summary.adherencePercent).toBe(100);
  });

  it('counts only completed sessions', () => {
    const summary = summarizeConsistency(sessions(6, false), 3, END);
    expect(summary.sessionsCompleted).toBe(0);
  });

  it('ignores sessions outside the window', () => {
    const stale: SessionRecord[] = [{ date: addDays(END, -60), completed: true }];
    expect(summarizeConsistency(stale, 3, END).sessionsCompleted).toBe(0);
  });

  it('reports the average per week', () => {
    expect(summarizeConsistency(sessions(12), 3, END).averagePerWeek).toBe(3);
  });

  it('counts weeks with at least one session', () => {
    const spread: SessionRecord[] = [
      { date: END, completed: true },
      { date: addDays(END, -14), completed: true },
    ];
    expect(summarizeConsistency(spread, 3, END).activeWeeks).toBe(2);
  });

  it('does not divide by zero when nothing was planned', () => {
    expect(summarizeConsistency(sessions(4), 0, END).adherencePercent).toBe(0);
  });
});

describe('summarizeLoggingConsistency', () => {
  it('counts distinct logged days in the window', () => {
    const dates = Array.from({ length: 14 }, (_, index) => addDays(END, -index));
    const summary = summarizeLoggingConsistency(dates, END);

    expect(summary.daysLogged).toBe(14);
    expect(summary.totalDays).toBe(21);
    expect(summary.percent).toBe(67);
  });

  it('does not double-count a day logged twice', () => {
    expect(summarizeLoggingConsistency([END, END, END], END).daysLogged).toBe(1);
  });

  it('handles an empty history', () => {
    expect(summarizeLoggingConsistency([], END).percent).toBe(0);
  });
});

describe('sessionsPerWeek', () => {
  it('returns one bucket per week, oldest first', () => {
    const weeks = sessionsPerWeek(sessions(21), END, 4);
    expect(weeks).toHaveLength(4);
    expect((weeks[0]?.weekStart ?? '') < (weeks[3]?.weekStart ?? '')).toBe(true);
  });

  it('counts the sessions inside each week', () => {
    const weeks = sessionsPerWeek(sessions(7), END, 2);
    expect(weeks[1]?.sessions).toBe(7);
    expect(weeks[0]?.sessions).toBe(0);
  });

  it('returns zeros rather than gaps for quiet weeks', () => {
    const weeks = sessionsPerWeek([], END, 3);
    expect(weeks.map((week) => week.sessions)).toEqual([0, 0, 0]);
  });
});
