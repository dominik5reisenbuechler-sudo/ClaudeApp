import { describe, expect, it } from 'vitest';

import {
  computeConfidence,
  confidenceBand,
  estimateAdaptiveTdee,
  maxAdjustmentKcal,
  plausibleIntakeDays,
  MAX_WINDOW_DAYS,
  MIN_WINDOW_DAYS,
} from './tdeeEstimator';
import type { IntakeDay, TdeeEstimateInput } from './tdeeEstimator';
import { addDays } from '@/utils/date';
import type { WeightPoint } from '@/types/domain';

const WINDOW_END = '2025-06-22';

/**
 * Daily weigh-ins ending on the window end, changing by `deltaPerDay`.
 *
 * Six extra days are generated before the window, because a 7-day average on
 * the window's first day needs the six days preceding it — the estimator
 * documents this requirement on its input.
 */
function weights(days: number, endWeight: number, deltaPerDay: number): WeightPoint[] {
  const total = days + 6;
  return Array.from({ length: total }, (_, index) => ({
    date: addDays(WINDOW_END, -(total - 1 - index)),
    weightKg: endWeight - (total - 1 - index) * deltaPerDay,
  }));
}

/** Daily intake logs across the window. */
function intake(days: number, energyKcal: number): IntakeDay[] {
  return Array.from({ length: days }, (_, index) => ({
    date: addDays(WINDOW_END, -(days - 1 - index)),
    energyKcal,
  }));
}

const input = (over: Partial<TdeeEstimateInput> = {}): TdeeEstimateInput => ({
  weights: weights(21, 80, 0),
  intake: intake(21, 2500),
  windowEnd: WINDOW_END,
  ...over,
});

describe('estimateAdaptiveTdee — the core identity', () => {
  it('reads expenditure straight off intake when weight is stable', () => {
    const estimate = estimateAdaptiveTdee(input());

    expect(estimate.estimatedTdeeKcal).toBe(2500);
    expect(estimate.meanIntakeKcal).toBe(2500);
    expect(Math.abs(estimate.weightChangeKgPerWeek ?? 1)).toBeLessThan(0.01);
  });

  it('subtracts the energy that went into gained mass', () => {
    // +0.05 kg/day = +0.35 kg/week → 0.35/7 × 7700 = 385 kcal/day of surplus.
    const estimate = estimateAdaptiveTdee(input({ weights: weights(21, 81, 0.05) }));

    expect(estimate.weightChangeKgPerWeek).toBeCloseTo(0.35, 2);
    expect(estimate.estimatedTdeeKcal).toBe(2120);
  });

  it('adds back the energy that came out of lost mass', () => {
    const estimate = estimateAdaptiveTdee(input({ weights: weights(21, 79, -0.05) }));

    expect(estimate.weightChangeKgPerWeek).toBeCloseTo(-0.35, 2);
    expect(estimate.estimatedTdeeKcal).toBe(2890);
  });

  it('recovers the rate from the regression, not from differencing two averages', () => {
    /*
     * The trap this pins down: a 7-day trailing average at day 6 is centred on
     * day 3, and one at day 20 on day 17 — 14 days apart, not 20. Dividing that
     * difference by the window length understates the rate by about a third,
     * which here would read as roughly 0.245 kg/week instead of 0.35.
     */
    const estimate = estimateAdaptiveTdee(input({ weights: weights(21, 81, 0.05) }));
    expect(estimate.weightChangeKgPerWeek).toBeGreaterThan(0.3);
  });

  it('rounds the estimate to 10 kcal — false precision helps nobody', () => {
    const estimate = estimateAdaptiveTdee(input({ intake: intake(21, 2517) }));
    expect((estimate.estimatedTdeeKcal ?? 0) % 10).toBe(0);
  });
});

describe('estimateAdaptiveTdee — refusing to over-claim', () => {
  it('will not analyse a shorter window than the minimum, however it is asked', () => {
    // A caller asking for five days gets fourteen. Short windows are dominated
    // by water and glycogen, and an estimate built on one would be noise.
    const estimate = estimateAdaptiveTdee(input({ windowDays: 5 }));
    expect(estimate.daysAnalysed).toBe(MIN_WINDOW_DAYS);
  });

  it('caps the window so stale data cannot dominate', () => {
    const estimate = estimateAdaptiveTdee(
      input({ weights: weights(60, 80, 0), intake: intake(60, 2500), windowDays: 90 }),
    );
    expect(estimate.daysAnalysed).toBe(MAX_WINDOW_DAYS);
  });

  it('refuses when there are too few weigh-ins to separate signal from water', () => {
    const sparse: WeightPoint[] = [
      { date: addDays(WINDOW_END, -20), weightKg: 80 },
      { date: WINDOW_END, weightKg: 80.5 },
    ];
    const estimate = estimateAdaptiveTdee(input({ weights: sparse }));

    expect(estimate.estimatedTdeeKcal).toBeNull();
    expect(estimate.isUsable).toBe(false);
    expect(estimate.explanation).toMatch(/weigh-ins/i);
  });

  it('refuses when nothing was logged', () => {
    const estimate = estimateAdaptiveTdee(input({ intake: [] }));

    expect(estimate.estimatedTdeeKcal).toBeNull();
    expect(estimate.explanation).toMatch(/food logging/i);
  });

  it('still shows the estimate at low confidence, but marks it unusable', () => {
    // Enough weigh-ins for a trend, but only a handful of logged days.
    const estimate = estimateAdaptiveTdee({
      ...input(),
      intake: intake(21, 2500).slice(0, 5),
    });

    expect(estimate.estimatedTdeeKcal).not.toBeNull();
    expect(estimate.isUsable).toBe(false);
    expect(estimate.explanation).toMatch(/not acting on it yet/i);
  });

  it('excludes the settling period after a goal change', () => {
    // The phase started 12 days ago, so only two days clear the 10-day settling
    // period — far short of the minimum window.
    const estimate = estimateAdaptiveTdee(
      input({ phaseStartedOn: addDays(WINDOW_END, -12) }),
    );

    expect(estimate.isUsable).toBe(false);
    expect(estimate.explanation).toMatch(/mostly water/i);
  });

  it('uses the full window once the settling period has passed', () => {
    const estimate = estimateAdaptiveTdee(
      input({ phaseStartedOn: addDays(WINDOW_END, -60) }),
    );

    expect(estimate.daysAnalysed).toBe(21);
    expect(estimate.estimatedTdeeKcal).toBe(2500);
  });
});

describe('plausibleIntakeDays', () => {
  it('drops days that are obviously a partial log', () => {
    const days = [...intake(10, 2800), { date: '2025-06-22', energyKcal: 320 }];
    expect(plausibleIntakeDays(days)).toHaveLength(10);
  });

  it('uses a relative threshold as well as an absolute one', () => {
    // 1,200 kcal clears the absolute floor, but for someone averaging 3,500 it
    // is clearly a day where meals went unlogged.
    const days = [...intake(10, 3500), { date: '2025-06-22', energyKcal: 1200 }];
    expect(plausibleIntakeDays(days)).toHaveLength(10);
  });

  it('keeps a genuinely low but complete day for a small person', () => {
    const days = intake(10, 1600);
    expect(plausibleIntakeDays(days)).toHaveLength(10);
  });

  it('handles an empty list', () => {
    expect(plausibleIntakeDays([])).toEqual([]);
  });
});

describe('computeConfidence', () => {
  it('is high for dense, complete, long data', () => {
    const confidence = computeConfidence({
      weighInCount: 18,
      plausibleDayCount: 20,
      loggedDayCount: 20,
      daysAnalysed: 21,
    });
    expect(confidence.overall).toBeGreaterThan(0.7);
  });

  it('multiplies rather than averages — one missing component sinks it', () => {
    // Perfect on three counts, nothing on the fourth.
    const confidence = computeConfidence({
      weighInCount: 0,
      plausibleDayCount: 20,
      loggedDayCount: 20,
      daysAnalysed: 21,
    });
    expect(confidence.overall).toBe(0);
  });

  it('penalises sparse weigh-ins', () => {
    const dense = computeConfidence({
      weighInCount: 12,
      plausibleDayCount: 18,
      loggedDayCount: 18,
      daysAnalysed: 21,
    });
    const sparse = computeConfidence({
      weighInCount: 3,
      plausibleDayCount: 18,
      loggedDayCount: 18,
      daysAnalysed: 21,
    });
    expect(sparse.overall).toBeLessThan(dense.overall);
  });

  it('penalises partial logs even when many days were touched', () => {
    const complete = computeConfidence({
      weighInCount: 12,
      plausibleDayCount: 18,
      loggedDayCount: 18,
      daysAnalysed: 21,
    });
    const partial = computeConfidence({
      weighInCount: 12,
      plausibleDayCount: 9,
      loggedDayCount: 18,
      daysAnalysed: 21,
    });
    expect(partial.loggingCompleteness).toBe(0.5);
    expect(partial.overall).toBeLessThan(complete.overall);
  });

  it('rewards a longer window', () => {
    const short = computeConfidence({
      weighInCount: 8,
      plausibleDayCount: 12,
      loggedDayCount: 12,
      daysAnalysed: 14,
    });
    const long = computeConfidence({
      weighInCount: 12,
      plausibleDayCount: 18,
      loggedDayCount: 18,
      daysAnalysed: 21,
    });
    expect(long.windowLength).toBeGreaterThan(short.windowLength);
  });

  it('never exceeds 1 on any component', () => {
    const confidence = computeConfidence({
      weighInCount: 100,
      plausibleDayCount: 30,
      loggedDayCount: 30,
      daysAnalysed: 28,
    });
    expect(confidence.overall).toBeLessThanOrEqual(1);
    expect(confidence.weighInDensity).toBe(1);
  });
});

describe('maxAdjustmentKcal — confidence gates action, not display', () => {
  it('permits nothing below 0.4', () => {
    expect(maxAdjustmentKcal(0)).toBe(0);
    expect(maxAdjustmentKcal(0.39)).toBe(0);
  });

  it('permits 100 kcal in the middle band', () => {
    expect(maxAdjustmentKcal(0.4)).toBe(100);
    expect(maxAdjustmentKcal(0.7)).toBe(100);
  });

  it('permits 200 kcal only at high confidence', () => {
    expect(maxAdjustmentKcal(0.71)).toBe(200);
    expect(maxAdjustmentKcal(1)).toBe(200);
  });
});

describe('confidenceBand', () => {
  it('names the bands', () => {
    expect(confidenceBand(0.1)).toBe('insufficient');
    expect(confidenceBand(0.3)).toBe('low');
    expect(confidenceBand(0.55)).toBe('moderate');
    expect(confidenceBand(0.9)).toBe('high');
  });
});

describe('explanations', () => {
  it('cites the real numbers', () => {
    const estimate = estimateAdaptiveTdee(input({ weights: weights(21, 81, 0.05) }));

    expect(estimate.explanation).toContain('2,500');
    expect(estimate.explanation).toContain('21 days');
    expect(estimate.explanation).toMatch(/rose 0\.35 kg per week/);
  });

  it('says the number is measured, not estimated, when it is usable', () => {
    const estimate = estimateAdaptiveTdee(input());
    expect(estimate.isUsable).toBe(true);
    expect(estimate.explanation).toMatch(/measured from your own data/i);
  });

  it('describes a steady weight as held steady rather than a tiny rate', () => {
    expect(estimateAdaptiveTdee(input()).explanation).toMatch(/held steady/);
  });
});
