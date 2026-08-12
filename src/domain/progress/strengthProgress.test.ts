import { describe, expect, it } from 'vitest';

import { strengthSeries, strengthTrend, trackedExercises } from './strengthProgress';
import type { StrengthSet } from './strengthProgress';
import { addDays } from '@/utils/date';

const START = '2025-06-02';

const set = (over: Partial<StrengthSet> = {}): StrengthSet => ({
  exerciseId: 'barbell_bench_press',
  weightKg: 100,
  reps: 5,
  setType: 'working',
  isCompleted: true,
  performedOn: START,
  ...over,
});

/** Weekly sessions with a steadily rising load. */
function progressingSets(weeks: number, startWeight: number, gainPerWeek: number): StrengthSet[] {
  return Array.from({ length: weeks }, (_, index) =>
    set({
      performedOn: addDays(START, index * 7),
      weightKg: startWeight + index * gainPerWeek,
    }),
  );
}

describe('strengthSeries', () => {
  it('produces one point per training day', () => {
    const series = strengthSeries(progressingSets(4, 100, 2.5), 'barbell_bench_press');
    expect(series).toHaveLength(4);
  });

  it('keeps the best estimate from a day with several sets', () => {
    const series = strengthSeries(
      [set({ weightKg: 90, reps: 5 }), set({ weightKg: 100, reps: 5 }), set({ weightKg: 95, reps: 5 })],
      'barbell_bench_press',
    );
    expect(series).toHaveLength(1);
    expect(series[0]?.weightKg).toBe(100);
  });

  it('is sorted oldest first, whatever order the sets arrive in', () => {
    const series = strengthSeries(
      [set({ performedOn: '2025-06-16' }), set({ performedOn: '2025-06-02' })],
      'barbell_bench_press',
    );
    expect(series.map((point) => point.date)).toEqual(['2025-06-02', '2025-06-16']);
  });

  it('ignores warm-ups and incomplete sets', () => {
    const series = strengthSeries(
      [
        set({ weightKg: 120, setType: 'warmup' }),
        set({ weightKg: 130, isCompleted: false }),
        set({ weightKg: 100 }),
      ],
      'barbell_bench_press',
    );
    expect(series[0]?.weightKg).toBe(100);
  });

  it('ignores high-rep sets, where the estimate stops meaning much', () => {
    const series = strengthSeries([set({ weightKg: 60, reps: 20 })], 'barbell_bench_press');
    expect(series).toEqual([]);
  });

  it('only includes the requested exercise', () => {
    const series = strengthSeries(
      [set(), set({ exerciseId: 'back_squat', weightKg: 140 })],
      'barbell_bench_press',
    );
    expect(series).toHaveLength(1);
  });
});

describe('strengthTrend', () => {
  it('recovers a steady rate of gain', () => {
    // +2.5 kg per week on the load → roughly the same on the estimate.
    const trend = strengthTrend(progressingSets(8, 100, 2.5), 'barbell_bench_press');
    expect(trend.kgPerWeek).toBeCloseTo(2.92, 1);
  });

  it('reports the total change from first to latest', () => {
    const trend = strengthTrend(progressingSets(5, 100, 2.5), 'barbell_bench_press');
    expect(trend.totalChangeKg).toBeGreaterThan(0);
    expect(trend.first?.weightKg).toBe(100);
    expect(trend.latest?.weightKg).toBe(110);
  });

  it('withholds a rate until there is enough history', () => {
    expect(strengthTrend(progressingSets(2, 100, 2.5), 'barbell_bench_press').kgPerWeek).toBeNull();
  });

  it('withholds a rate when the sessions are packed into a few days', () => {
    // Three sessions in one week says nothing about a weekly rate.
    const sets = [
      set({ performedOn: START }),
      set({ performedOn: addDays(START, 2), weightKg: 105 }),
      set({ performedOn: addDays(START, 4), weightKg: 110 }),
    ];
    expect(strengthTrend(sets, 'barbell_bench_press').kgPerWeek).toBeNull();
  });

  it('returns an empty trend for an exercise with no history', () => {
    const trend = strengthTrend([], 'barbell_bench_press');
    expect(trend.points).toEqual([]);
    expect(trend.first).toBeNull();
    expect(trend.totalChangeKg).toBeNull();
  });

  it('reports a decline as a negative rate', () => {
    const trend = strengthTrend(progressingSets(8, 120, -2), 'barbell_bench_press');
    expect(trend.kgPerWeek).toBeLessThan(0);
  });
});

describe('trackedExercises', () => {
  it('lists exercises with enough history, most-trained first', () => {
    const sets = [
      ...progressingSets(4, 100, 2.5),
      set({ exerciseId: 'back_squat', performedOn: START, weightKg: 140 }),
      set({ exerciseId: 'back_squat', performedOn: addDays(START, 7), weightKg: 142.5 }),
    ];

    expect(trackedExercises(sets)).toEqual(['barbell_bench_press', 'back_squat']);
  });

  it('excludes exercises logged only once', () => {
    const sets = [...progressingSets(3, 100, 2.5), set({ exerciseId: 'dip', weightKg: 20 })];
    expect(trackedExercises(sets)).not.toContain('dip');
  });

  it('handles an empty history', () => {
    expect(trackedExercises([])).toEqual([]);
  });
});
