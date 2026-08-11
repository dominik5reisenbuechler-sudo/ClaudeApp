import { describe, expect, it } from 'vitest';

import {
  averageAsOf,
  movingAverage,
  normalizeWeightPoints,
  weightTrend,
} from './weightTrend';
import { addDays } from '@/utils/date';
import type { WeightPoint } from '@/types/domain';

/** Daily weigh-ins starting at `startWeight`, changing by `deltaPerDay`. */
function series(days: number, startWeight: number, deltaPerDay: number, from = '2025-01-01') {
  const points: WeightPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    points.push({ date: addDays(from, i), weightKg: startWeight + i * deltaPerDay });
  }
  return points;
}

describe('normalizeWeightPoints', () => {
  it('sorts ascending', () => {
    const result = normalizeWeightPoints([
      { date: '2025-01-03', weightKg: 81 },
      { date: '2025-01-01', weightKg: 80 },
    ]);
    expect(result.map((p) => p.date)).toEqual(['2025-01-01', '2025-01-03']);
  });

  it('keeps the last value when a date is logged twice', () => {
    const result = normalizeWeightPoints([
      { date: '2025-01-01', weightKg: 88 },
      { date: '2025-01-01', weightKg: 80.5 },
    ]);
    expect(result).toEqual([{ date: '2025-01-01', weightKg: 80.5 }]);
  });

  it('drops malformed dates and impossible weights', () => {
    const result = normalizeWeightPoints([
      { date: 'not-a-date', weightKg: 80 },
      { date: '2025-01-01', weightKg: 0 },
      { date: '2025-01-02', weightKg: -5 },
      { date: '2025-01-03', weightKg: Number.NaN },
      { date: '2025-01-04', weightKg: 80 },
    ]);
    expect(result).toEqual([{ date: '2025-01-04', weightKg: 80 }]);
  });
});

describe('movingAverage', () => {
  it('smooths a noisy series', () => {
    const points: WeightPoint[] = [
      { date: '2025-01-01', weightKg: 80.0 },
      { date: '2025-01-02', weightKg: 81.5 },
      { date: '2025-01-03', weightKg: 79.5 },
      { date: '2025-01-04', weightKg: 80.2 },
    ];
    const result = movingAverage(points, 7);
    expect(result[3]?.averageKg).toBeCloseTo(80.3, 1);
  });

  it('withholds an average until the window holds enough weigh-ins', () => {
    const result = movingAverage([{ date: '2025-01-01', weightKg: 80 }], 7);
    expect(result[0]?.averageKg).toBeNull();
  });

  it('uses a calendar window, not the last N samples', () => {
    // Two weigh-ins three weeks apart must not be averaged together.
    const result = movingAverage(
      [
        { date: '2025-01-01', weightKg: 90 },
        { date: '2025-01-22', weightKg: 80 },
      ],
      7,
    );
    expect(result[1]?.averageKg).toBeNull();
  });

  it('preserves the raw observation alongside the average', () => {
    const result = movingAverage(series(10, 80, 0.1), 7);
    expect(result[5]?.weightKg).toBeCloseTo(80.5, 6);
  });

  it('rejects a zero or negative window', () => {
    expect(() => movingAverage([], 0)).toThrow();
  });
});

describe('averageAsOf', () => {
  it('averages the trailing window', () => {
    const points = series(7, 80, 0.1);
    // 80.0 … 80.6, mean 80.3
    expect(averageAsOf(points)).toBeCloseTo(80.3, 1);
  });

  it('returns null when there is nothing logged', () => {
    expect(averageAsOf([])).toBeNull();
  });

  it('returns null when the window is too sparse to smooth', () => {
    expect(averageAsOf([{ date: '2025-01-01', weightKg: 80 }])).toBeNull();
  });

  it('respects an explicit as-of date', () => {
    const points = series(30, 80, 0.1);
    const early = averageAsOf(points, '2025-01-10');
    const late = averageAsOf(points, '2025-01-30');
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(late as number).toBeGreaterThan(early as number);
  });
});

describe('weightTrend', () => {
  it('recovers a known rate of gain', () => {
    // +0.05 kg/day = +0.35 kg/week.
    const trend = weightTrend(series(28, 80, 0.05));
    expect(trend).not.toBeNull();
    expect(trend?.kgPerWeek).toBeCloseTo(0.35, 2);
  });

  it('recovers a known rate of loss', () => {
    const trend = weightTrend(series(28, 90, -0.08));
    expect(trend?.kgPerWeek).toBeCloseTo(-0.56, 2);
  });

  it('reports approximately zero for a stable weight', () => {
    const trend = weightTrend(series(28, 80, 0));
    expect(Math.abs(trend?.kgPerWeek ?? 1)).toBeLessThan(0.01);
  });

  it('expresses the rate as a percentage of bodyweight', () => {
    const trend = weightTrend(series(28, 80, 0.05));
    // 0.35 kg/week on ~81 kg ≈ 0.43 %/week
    expect(trend?.percentPerWeek).toBeCloseTo(0.43, 1);
  });

  it('refuses to report a trend from too short a history', () => {
    expect(weightTrend(series(5, 80, 0.05))).toBeNull();
  });

  it('refuses to report a trend from too few weigh-ins', () => {
    const sparse: WeightPoint[] = [
      { date: '2025-01-01', weightKg: 80 },
      { date: '2025-01-02', weightKg: 80.2 },
      { date: '2025-01-20', weightKg: 81 },
    ];
    expect(weightTrend(sparse)).toBeNull();
  });

  it('returns null for no data at all', () => {
    expect(weightTrend([])).toBeNull();
  });

  it('is not swung by a single outlying weigh-in', () => {
    const clean = series(28, 80, 0.05);
    const withOutlier = clean.map((point, index) =>
      index === clean.length - 1 ? { ...point, weightKg: point.weightKg + 3 } : point,
    );

    const cleanTrend = weightTrend(clean);
    const outlierTrend = weightTrend(withOutlier);
    expect(cleanTrend).not.toBeNull();
    expect(outlierTrend).not.toBeNull();

    // A 3 kg spike on the final day must not move the weekly rate much.
    const delta = Math.abs((outlierTrend as { kgPerWeek: number }).kgPerWeek - (cleanTrend as { kgPerWeek: number }).kgPerWeek);
    expect(delta).toBeLessThan(0.35);
  });

  it('reports the span and sample count it used', () => {
    const trend = weightTrend(series(28, 80, 0.05));
    expect(trend?.spanDays).toBeGreaterThanOrEqual(10);
    expect(trend?.sampleCount).toBeGreaterThanOrEqual(4);
  });

  it('handles irregular weigh-in schedules', () => {
    // Three weigh-ins a week for four weeks.
    const points: WeightPoint[] = [];
    for (let week = 0; week < 4; week += 1) {
      for (const offset of [0, 2, 4]) {
        const day = week * 7 + offset;
        points.push({ date: addDays('2025-01-01', day), weightKg: 80 + day * 0.05 });
      }
    }
    // The underlying rate is 0.05 kg/day = 0.35 kg/week. Regressing against
    // real day offsets recovers it despite the uneven 2/2/3-day gaps; a
    // per-sample slope would not.
    const trend = weightTrend(points);
    expect(trend).not.toBeNull();
    expect(trend?.kgPerWeek).toBeCloseTo(0.35, 1);
  });
});
