import { describe, expect, it } from 'vitest';

import {
  reconcileSteps,
  reconcileWeights,
  MAX_PLAUSIBLE_STEPS,
  MAX_PLAUSIBLE_WEIGHT_KG,
  MIN_PLAUSIBLE_WEIGHT_KG,
} from './reconcile';
import type { ExistingLog, HealthStepSample, HealthWeightSample } from './reconcile';

const PHONE = { name: 'iPhone', isDevice: false };
const SCALE = { name: 'Withings Body+', isDevice: true };

function weight(
  date: string,
  weightKg: number,
  over: Partial<HealthWeightSample> = {},
): HealthWeightSample {
  return { date, weightKg, recordedAt: `${date}T07:00:00Z`, source: PHONE, ...over };
}

function steps(date: string, count: number, isDevice = true): HealthStepSample {
  return { date, steps: count, source: { name: 'iPhone', isDevice } };
}

describe('reconcileWeights — a manual entry always wins', () => {
  it('never overwrites what the user typed', () => {
    const existing: ExistingLog[] = [{ date: '2025-06-20', source: 'manual' }];
    const result = reconcileWeights([weight('2025-06-20', 82.1)], existing, 'healthkit');

    expect(result.toInsert).toEqual([]);
    expect(result.skipped).toEqual([{ date: '2025-06-20', reason: 'manual_entry_exists' }]);
  });

  it('says so in the summary rather than quietly doing less', () => {
    const existing: ExistingLog[] = [{ date: '2025-06-20', source: 'manual' }];
    const result = reconcileWeights(
      [weight('2025-06-20', 82.1), weight('2025-06-21', 82.3)],
      existing,
      'healthkit',
    );

    expect(result.toInsert).toHaveLength(1);
    expect(result.summary).toMatch(/what you typed always wins/i);
  });

  it('fills a gap where there is no entry at all', () => {
    const result = reconcileWeights([weight('2025-06-20', 82.1)], [], 'healthkit');

    expect(result.toInsert).toEqual([
      { date: '2025-06-20', weightKg: 82.1, source: 'healthkit' },
    ]);
  });

  it('does not re-import a day it already synced', () => {
    const existing: ExistingLog[] = [{ date: '2025-06-20', source: 'healthkit' }];
    const result = reconcileWeights([weight('2025-06-20', 82.1)], existing, 'healthkit');

    expect(result.toInsert).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('already_synced');
  });

  it('produces no deletes and no updates — only inserts', () => {
    const result = reconcileWeights([weight('2025-06-20', 82.1)], [], 'healthkit');
    expect(Object.keys(result)).toEqual(['toInsert', 'skipped', 'summary']);
  });
});

describe('reconcileWeights — picking between readings on one day', () => {
  it('prefers a hardware scale over a typed-in app reading', () => {
    const result = reconcileWeights(
      [
        weight('2025-06-20', 82.9, { source: PHONE, recordedAt: '2025-06-20T09:00:00Z' }),
        weight('2025-06-20', 82.1, { source: SCALE, recordedAt: '2025-06-20T07:00:00Z' }),
      ],
      [],
      'healthkit',
    );

    expect(result.toInsert).toEqual([
      { date: '2025-06-20', weightKg: 82.1, source: 'smart_scale' },
    ]);
  });

  it('takes the later of two readings from the same kind of source', () => {
    const result = reconcileWeights(
      [
        weight('2025-06-20', 82.9, { recordedAt: '2025-06-20T07:00:00Z' }),
        weight('2025-06-20', 82.4, { recordedAt: '2025-06-20T09:00:00Z' }),
      ],
      [],
      'healthkit',
    );

    expect(result.toInsert[0]?.weightKg).toBe(82.4);
  });

  it('records a device reading as a smart scale, whichever store it came through', () => {
    const result = reconcileWeights([weight('2025-06-20', 82.1, { source: SCALE })], [], 'health_connect');
    expect(result.toInsert[0]?.source).toBe('smart_scale');
  });

  it('records a non-device reading as coming from the health store', () => {
    const result = reconcileWeights([weight('2025-06-20', 82.1)], [], 'health_connect');
    expect(result.toInsert[0]?.source).toBe('health_connect');
  });
});

describe('reconcileWeights — implausible readings are dropped, not smoothed', () => {
  it('drops a reading below the plausible floor', () => {
    const result = reconcileWeights(
      [weight('2025-06-20', MIN_PLAUSIBLE_WEIGHT_KG - 1)],
      [],
      'healthkit',
    );

    expect(result.toInsert).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('implausible');
  });

  it('drops a reading above the plausible ceiling', () => {
    const result = reconcileWeights(
      [weight('2025-06-20', MAX_PLAUSIBLE_WEIGHT_KG + 1)],
      [],
      'healthkit',
    );

    expect(result.toInsert).toEqual([]);
  });

  it('keeps the good days when one reading is bad', () => {
    const result = reconcileWeights(
      [weight('2025-06-20', 4), weight('2025-06-21', 82.3)],
      [],
      'healthkit',
    );

    expect(result.toInsert).toHaveLength(1);
    expect(result.summary).toMatch(/looked wrong/i);
  });

  it('rounds to two decimals — scales report more precision than exists', () => {
    const result = reconcileWeights([weight('2025-06-20', 82.13456)], [], 'healthkit');
    expect(result.toInsert[0]?.weightKg).toBe(82.13);
  });
});

describe('reconcileWeights — ordering and idempotency', () => {
  it('returns inserts oldest first', () => {
    const result = reconcileWeights(
      [weight('2025-06-22', 82.1), weight('2025-06-20', 82.5), weight('2025-06-21', 82.3)],
      [],
      'healthkit',
    );

    expect(result.toInsert.map((row) => row.date)).toEqual([
      '2025-06-20',
      '2025-06-21',
      '2025-06-22',
    ]);
  });

  it('is empty on a second run once the first run is recorded', () => {
    const samples = [weight('2025-06-20', 82.1), weight('2025-06-21', 82.3)];
    const first = reconcileWeights(samples, [], 'healthkit');
    const recorded: ExistingLog[] = first.toInsert.map((row) => ({
      date: row.date,
      source: row.source,
    }));

    expect(reconcileWeights(samples, recorded, 'healthkit').toInsert).toEqual([]);
  });

  it('says nothing was found when there is genuinely nothing', () => {
    const result = reconcileWeights([], [], 'healthkit');
    expect(result.summary).toMatch(/nothing new to import/i);
  });
});

describe('reconcileSteps', () => {
  it('fills gaps and leaves manual entries alone', () => {
    const existing: ExistingLog[] = [{ date: '2025-06-20', source: 'manual' }];
    const result = reconcileSteps(
      [steps('2025-06-20', 9000), steps('2025-06-21', 11_200)],
      existing,
      'healthkit',
    );

    expect(result.toInsert).toEqual([
      { date: '2025-06-21', steps: 11200, source: 'healthkit' },
    ]);
  });

  it('takes the highest count when two devices report the same day', () => {
    // A watch usually sees the whole day; the phone in a bag sees part of it.
    const result = reconcileSteps(
      [steps('2025-06-20', 4200), steps('2025-06-20', 11_800)],
      [],
      'healthkit',
    );

    expect(result.toInsert[0]?.steps).toBe(11800);
  });

  it('drops an impossible count', () => {
    const result = reconcileSteps([steps('2025-06-20', MAX_PLAUSIBLE_STEPS + 1)], [], 'healthkit');

    expect(result.toInsert).toEqual([]);
    expect(result.skipped[0]?.reason).toBe('implausible');
  });

  it('drops a negative count', () => {
    expect(reconcileSteps([steps('2025-06-20', -5)], [], 'healthkit').toInsert).toEqual([]);
  });

  it('keeps a zero-step day — that is a real day, not missing data', () => {
    const result = reconcileSteps([steps('2025-06-20', 0)], [], 'healthkit');
    expect(result.toInsert).toEqual([{ date: '2025-06-20', steps: 0, source: 'healthkit' }]);
  });

  it('rounds fractional counts', () => {
    const result = reconcileSteps([steps('2025-06-20', 9000.6)], [], 'healthkit');
    expect(result.toInsert[0]?.steps).toBe(9001);
  });
});

describe('summaries never leave a gap in the copy', () => {
  it('reads correctly for one of everything', () => {
    const result = reconcileWeights(
      [weight('2025-06-19', 82.1), weight('2025-06-20', 82.3), weight('2025-06-21', 3)],
      [{ date: '2025-06-20', source: 'manual' }],
      'healthkit',
    );

    expect(result.summary).not.toMatch(/undefined|NaN/);
    expect(result.summary).toContain('1 day kept your own entry');
    expect(result.summary).toContain('1 reading looked wrong');
  });
});
