import { describe, expect, it } from 'vitest';

import { estimatedDailySteps, summarizeSteps } from './steps';
import type { StepPoint } from './steps';
import { addDays } from '@/utils/date';

const TODAY = '2025-06-15';

function series(days: number, steps: number, endingOn = TODAY): StepPoint[] {
  const points: StepPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    points.push({ date: addDays(endingOn, -i), steps });
  }
  return points;
}

describe('summarizeSteps', () => {
  it('summarises a full week', () => {
    const summary = summarizeSteps(series(7, 9000), 10000, TODAY);
    expect(summary.todaySteps).toBe(9000);
    expect(summary.averageDailySteps).toBe(9000);
    expect(summary.daysLogged).toBe(7);
    expect(summary.daysGoalMet).toBe(0);
    expect(summary.goalMet).toBe(false);
    expect(summary.remainingToday).toBe(1000);
  });

  it('reports the goal as met without a negative remainder', () => {
    const summary = summarizeSteps([{ date: TODAY, steps: 12000 }], 10000, TODAY);
    expect(summary.goalMet).toBe(true);
    expect(summary.remainingToday).toBe(0);
  });

  it('returns null for today when nothing is logged', () => {
    const summary = summarizeSteps([{ date: addDays(TODAY, -1), steps: 8000 }], 10000, TODAY);
    expect(summary.todaySteps).toBeNull();
    expect(summary.remainingToday).toBe(10000);
  });

  it('averages only logged days, so a missed log does not look sedentary', () => {
    const points: StepPoint[] = [
      { date: addDays(TODAY, -2), steps: 10000 },
      { date: TODAY, steps: 10000 },
    ];
    // Two logged days at 10k. Counting the five unlogged days as zero would
    // give ~2,857 and quietly understate the user's activity.
    expect(summarizeSteps(points, 10000, TODAY).averageDailySteps).toBe(10000);
    expect(summarizeSteps(points, 10000, TODAY).daysLogged).toBe(2);
  });

  it('returns a null average when nothing at all is logged', () => {
    const summary = summarizeSteps([], 10000, TODAY);
    expect(summary.averageDailySteps).toBeNull();
    expect(summary.daysLogged).toBe(0);
  });

  it('excludes entries outside the window', () => {
    const points: StepPoint[] = [
      { date: addDays(TODAY, -30), steps: 20000 },
      { date: TODAY, steps: 5000 },
    ];
    expect(summarizeSteps(points, 10000, TODAY).averageDailySteps).toBe(5000);
  });

  it('excludes entries dated after today', () => {
    const points: StepPoint[] = [
      { date: TODAY, steps: 5000 },
      { date: addDays(TODAY, 1), steps: 30000 },
    ];
    expect(summarizeSteps(points, 10000, TODAY).averageDailySteps).toBe(5000);
  });

  it('keeps the last value when a day is logged twice', () => {
    const points: StepPoint[] = [
      { date: TODAY, steps: 3000 },
      { date: TODAY, steps: 11000 },
    ];
    expect(summarizeSteps(points, 10000, TODAY).todaySteps).toBe(11000);
  });

  it('drops malformed entries', () => {
    const points: StepPoint[] = [
      { date: 'yesterday', steps: 9000 },
      { date: addDays(TODAY, -1), steps: -5 },
      { date: TODAY, steps: 8000 },
    ];
    const summary = summarizeSteps(points, 10000, TODAY);
    expect(summary.daysLogged).toBe(1);
    expect(summary.todaySteps).toBe(8000);
  });

  it('counts days that met the goal', () => {
    const points: StepPoint[] = [
      { date: addDays(TODAY, -2), steps: 12000 },
      { date: addDays(TODAY, -1), steps: 4000 },
      { date: TODAY, steps: 11000 },
    ];
    expect(summarizeSteps(points, 10000, TODAY).daysGoalMet).toBe(2);
  });

  it('rejects a zero window', () => {
    expect(() => summarizeSteps([], 10000, TODAY, 0)).toThrow();
  });
});

describe('estimatedDailySteps', () => {
  it('falls back to the onboarding estimate until enough is logged', () => {
    const result = estimatedDailySteps(series(3, 12000), 6000, TODAY);
    expect(result).toEqual({ steps: 6000, source: 'onboarding' });
  });

  it('uses logged data once there is enough of it', () => {
    const result = estimatedDailySteps(series(10, 12000), 6000, TODAY);
    expect(result).toEqual({ steps: 12000, source: 'logged' });
  });

  it('ignores data older than the lookback window', () => {
    const stale = series(10, 20000, addDays(TODAY, -60));
    expect(estimatedDailySteps(stale, 6000, TODAY).source).toBe('onboarding');
  });

  it('falls back when there is no history at all', () => {
    expect(estimatedDailySteps([], 7500, TODAY)).toEqual({ steps: 7500, source: 'onboarding' });
  });
});
