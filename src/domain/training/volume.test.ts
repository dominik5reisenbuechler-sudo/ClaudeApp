import { describe, expect, it } from 'vitest';

import {
  countsTowardVolume,
  sessionTonnage,
  setsInWindow,
  summarizeWeeklyVolume,
  totalWorkingSets,
  weeklySetsByMuscle,
} from './volume';
import type { ContributionMap, PerformedSet } from './volume';

/** The seeded credits for three exercises, in the shape the domain consumes. */
const contributions: ContributionMap = new Map([
  [
    'barbell_bench_press',
    [
      { muscleId: 'chest' as const, setCredit: 1 },
      { muscleId: 'triceps' as const, setCredit: 0.5 },
      { muscleId: 'front_delts' as const, setCredit: 0.5 },
    ],
  ],
  ['cable_pushdown', [{ muscleId: 'triceps' as const, setCredit: 1 }]],
  [
    'back_squat',
    [
      { muscleId: 'quads' as const, setCredit: 1 },
      { muscleId: 'glutes' as const, setCredit: 1 },
      { muscleId: 'adductors' as const, setCredit: 0.5 },
    ],
  ],
]);

const set = (over: Partial<PerformedSet> = {}): PerformedSet => ({
  exerciseId: 'barbell_bench_press',
  setType: 'working',
  isCompleted: true,
  performedOn: '2025-06-16',
  reps: 10,
  ...over,
});

describe('countsTowardVolume', () => {
  it('counts a completed working set', () => {
    expect(countsTowardVolume(set())).toBe(true);
  });

  it('excludes warm-ups — preparation is not stimulus', () => {
    expect(countsTowardVolume(set({ setType: 'warmup' }))).toBe(false);
  });

  it('counts back-offs, drops, myo-reps and AMRAPs', () => {
    for (const setType of ['backoff', 'drop', 'myo_rep', 'amrap'] as const) {
      expect(countsTowardVolume(set({ setType })), setType).toBe(true);
    }
  });

  it('excludes an incomplete set', () => {
    expect(countsTowardVolume(set({ isCompleted: false }))).toBe(false);
  });

  it('excludes a set with no reps — it did not happen', () => {
    expect(countsTowardVolume(set({ reps: 0 }))).toBe(false);
    expect(countsTowardVolume(set({ reps: null }))).toBe(false);
  });
});

describe('weeklySetsByMuscle', () => {
  it('applies fractional credits — the spec example', () => {
    // Three sets of bench: chest gets 3, triceps and front delts 1.5 each.
    const totals = weeklySetsByMuscle([set(), set(), set()], contributions);

    expect(totals.chest).toBe(3);
    expect(totals.triceps).toBe(1.5);
    expect(totals.front_delts).toBe(1.5);
  });

  it('adds direct work on top of the fractional credit', () => {
    // 3 bench + 3 pushdowns → triceps 1.5 + 3 = 4.5.
    const sets = [set(), set(), set(), ...Array.from({ length: 3 }, () => set({ exerciseId: 'cable_pushdown' }))];
    const totals = weeklySetsByMuscle(sets, contributions);

    expect(totals.chest).toBe(3);
    expect(totals.triceps).toBe(4.5);
  });

  it('credits two primaries fully from one compound', () => {
    const totals = weeklySetsByMuscle(
      Array.from({ length: 4 }, () => set({ exerciseId: 'back_squat' })),
      contributions,
    );
    expect(totals.quads).toBe(4);
    expect(totals.glutes).toBe(4);
    expect(totals.adductors).toBe(2);
  });

  it('returns every muscle, including the untrained ones', () => {
    const totals = weeklySetsByMuscle([set()], contributions);
    expect(totals.calves).toBe(0);
    expect(Object.keys(totals)).toHaveLength(18);
  });

  it('ignores warm-ups', () => {
    const totals = weeklySetsByMuscle([set(), set({ setType: 'warmup' })], contributions);
    expect(totals.chest).toBe(1);
  });

  it('ignores an exercise with no credit data rather than guessing', () => {
    const totals = weeklySetsByMuscle([set({ exerciseId: 'unknown_lift' })], contributions);
    expect(totals.chest).toBe(0);
  });

  it('handles an empty week', () => {
    const totals = weeklySetsByMuscle([], contributions);
    expect(totals.chest).toBe(0);
  });

  it('does not accumulate floating-point drift', () => {
    // Ten half-credits should be exactly 5, not 4.999999999999999.
    const totals = weeklySetsByMuscle(
      Array.from({ length: 10 }, () => set()),
      contributions,
    );
    expect(totals.triceps).toBe(5);
  });
});

describe('setsInWindow', () => {
  it('keeps the seven days ending on the given date', () => {
    const sets = [
      set({ performedOn: '2025-06-16' }),
      set({ performedOn: '2025-06-22' }),
      set({ performedOn: '2025-06-15' }),
    ];
    const inWindow = setsInWindow(sets, '2025-06-22');
    expect(inWindow).toHaveLength(2);
  });

  it('excludes sets dated after the window end', () => {
    const sets = [set({ performedOn: '2025-06-23' })];
    expect(setsInWindow(sets, '2025-06-22')).toHaveLength(0);
  });
});

describe('summarizeWeeklyVolume', () => {
  const targets = { chest: { minSets: 10, maxSets: 16 }, triceps: { minSets: 8, maxSets: 14 } };

  it('flags a muscle below its band', () => {
    const summary = summarizeWeeklyVolume([set(), set()], contributions, targets);
    const chest = summary.find((entry) => entry.muscleId === 'chest');
    expect(chest?.sets).toBe(2);
    expect(chest?.status).toBe('under');
  });

  it('reports in-range volume', () => {
    const sets = Array.from({ length: 12 }, () => set());
    const chest = summarizeWeeklyVolume(sets, contributions, targets).find(
      (entry) => entry.muscleId === 'chest',
    );
    expect(chest?.status).toBe('in_range');
  });

  it('reports volume over the band without treating it as an error', () => {
    const sets = Array.from({ length: 20 }, () => set());
    const chest = summarizeWeeklyVolume(sets, contributions, targets).find(
      (entry) => entry.muscleId === 'chest',
    );
    expect(chest?.status).toBe('over');
  });

  it('counts training frequency in distinct days', () => {
    const sets = [
      set({ performedOn: '2025-06-16' }),
      set({ performedOn: '2025-06-16' }),
      set({ performedOn: '2025-06-19' }),
    ];
    const chest = summarizeWeeklyVolume(sets, contributions, targets).find(
      (entry) => entry.muscleId === 'chest',
    );
    expect(chest?.frequency).toBe(2);
  });

  it('falls back to a sensible band for muscles with no explicit target', () => {
    const calves = summarizeWeeklyVolume([set()], contributions, targets).find(
      (entry) => entry.muscleId === 'calves',
    );
    expect(calves?.minSets).toBe(8);
    expect(calves?.status).toBe('under');
  });
});

describe('totalWorkingSets and sessionTonnage', () => {
  it('counts only sets that contribute', () => {
    expect(totalWorkingSets([set(), set({ setType: 'warmup' }), set()])).toBe(2);
  });

  it('sums load × reps across working sets', () => {
    const sets = [
      { ...set({ reps: 10 }), weightKg: 80 },
      { ...set({ reps: 8 }), weightKg: 80 },
      { ...set({ setType: 'warmup' as const, reps: 10 }), weightKg: 40 },
    ];
    expect(sessionTonnage(sets)).toBe(1440);
  });
});
