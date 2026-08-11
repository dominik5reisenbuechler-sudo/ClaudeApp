import { describe, expect, it } from 'vitest';

import { summarizeWeight } from './weightSummary';
import { addDays } from '@/utils/date';
import type { WeightPoint } from '@/types/domain';

const TODAY = '2025-06-15';

/** Daily weigh-ins ending on `TODAY`, changing by `deltaPerDay`. */
function series(days: number, endWeight: number, deltaPerDay: number): WeightPoint[] {
  const points: WeightPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    points.push({ date: addDays(TODAY, -i), weightKg: endWeight - i * deltaPerDay });
  }
  return points;
}

describe('summarizeWeight', () => {
  it('reports "not enough data" rather than guessing from a few weigh-ins', () => {
    const summary = summarizeWeight(series(3, 80, 0.05), 'lean_bulk', TODAY);
    expect(summary.assessment).toBe('unknown');
    expect(summary.trend).toBeNull();
    expect(summary.message).toMatch(/keep logging/i);
  });

  it('returns an empty summary for no data at all', () => {
    const summary = summarizeWeight([], 'cut', TODAY);
    expect(summary.latest).toBeNull();
    expect(summary.loggedToday).toBe(false);
    expect(summary.averageKg).toBeNull();
    expect(summary.assessment).toBe('unknown');
  });

  it('detects whether today has been logged', () => {
    expect(summarizeWeight(series(10, 80, 0), 'cut', TODAY).loggedToday).toBe(true);

    const stale = series(10, 80, 0).slice(0, -1);
    expect(summarizeWeight(stale, 'cut', TODAY).loggedToday).toBe(false);
  });

  it('surfaces the latest weigh-in even when it is not today', () => {
    const stale = series(10, 80, 0).slice(0, -1);
    const summary = summarizeWeight(stale, 'cut', TODAY);
    expect(summary.latest?.date).toBe(addDays(TODAY, -1));
  });

  it('calls a correctly-paced lean bulk on target', () => {
    // +0.05 kg/day = 0.35 kg/week ≈ 0.43%/week at 81 kg — inside 0.25–0.5%.
    const summary = summarizeWeight(series(28, 81, 0.05), 'lean_bulk', TODAY);
    expect(summary.assessment).toBe('on_target');
    expect(summary.message).toMatch(/no change needed/i);
  });

  it('flags a lean bulk that is gaining too fast', () => {
    const summary = summarizeWeight(series(28, 81, 0.15), 'lean_bulk', TODAY);
    expect(summary.assessment).toBe('above_band');
    expect(summary.message).toMatch(/faster than a lean bulk/i);
  });

  it('flags a stalled lean bulk', () => {
    const summary = summarizeWeight(series(28, 81, 0), 'lean_bulk', TODAY);
    expect(summary.assessment).toBe('below_band');
    expect(summary.message).toMatch(/slower than your bulk/i);
  });

  it('flags a stalled cut as above the band, and says so in the user\'s terms', () => {
    // On a cut the band is negative, so "losing too slowly" is numerically
    // ABOVE the band. The message must talk about the cut stalling, not about
    // the sign of the number.
    const summary = summarizeWeight(series(28, 90, -0.01), 'cut', TODAY);
    expect(summary.assessment).toBe('above_band');
    expect(summary.message).toMatch(/slower than your cut/i);
  });

  it('flags a cut that is losing too fast', () => {
    // −0.2 kg/day ≈ −1.4 kg/week ≈ −1.6%/week, well past the 1.0% limit.
    const summary = summarizeWeight(series(28, 90, -0.2), 'cut', TODAY);
    expect(summary.assessment).toBe('below_band');
    expect(summary.message).toMatch(/faster than your cut/i);
    expect(summary.message).toMatch(/lean mass/i);
  });

  it('calls a well-paced cut on target', () => {
    // −0.08 kg/day = −0.56 kg/week ≈ −0.62%/week at 90 kg — inside 0.5–1.0%.
    const summary = summarizeWeight(series(28, 90, -0.08), 'cut', TODAY);
    expect(summary.assessment).toBe('on_target');
  });

  it('cites the real numbers in its message', () => {
    const summary = summarizeWeight(series(28, 81, 0.05), 'lean_bulk', TODAY);
    expect(summary.message).toContain('7-day average');
    expect(summary.message).toContain(`${summary.trend?.spanDays} days`);
  });

  it('exposes the 7-day average alongside the raw weigh-in', () => {
    const summary = summarizeWeight(series(28, 81, 0.05), 'lean_bulk', TODAY);
    expect(summary.latest?.weightKg).toBe(81);
    expect(summary.averageKg).not.toBeNull();
    // The average trails a rising series, so it sits below the latest reading.
    expect(summary.averageKg as number).toBeLessThan(81);
  });

  it('is not swung into a different verdict by one outlying weigh-in', () => {
    const clean = series(28, 81, 0.05);
    const spiked = clean.map((point, index) =>
      index === clean.length - 1 ? { ...point, weightKg: point.weightKg + 2.5 } : point,
    );
    expect(summarizeWeight(clean, 'lean_bulk', TODAY).assessment).toBe('on_target');
    expect(summarizeWeight(spiked, 'lean_bulk', TODAY).assessment).toBe('on_target');
  });
});
