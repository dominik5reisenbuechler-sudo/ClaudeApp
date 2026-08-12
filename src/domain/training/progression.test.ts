import { describe, expect, it } from 'vitest';

import {
  computeProgression,
  estimatedOneRepMax,
  isPerformanceUnstable,
  sessionLoad,
  totalReps,
} from './progression';
import type { LoggedSet, ProgressionInput } from './progression';

const set = (over: Partial<LoggedSet> = {}): LoggedSet => ({
  weightKg: 80,
  reps: 10,
  rir: 2,
  isCompleted: true,
  techniqueBreakdown: false,
  painReported: false,
  ...over,
});

const input = (over: Partial<ProgressionInput> = {}): ProgressionInput => ({
  targetRepMin: 8,
  targetRepMax: 12,
  targetRir: 2,
  loadIncrementKg: 2.5,
  lastSession: [set(), set(), set()],
  ...over,
});

describe('sessionLoad', () => {
  it('takes the load most sets were performed at', () => {
    expect(sessionLoad([set({ weightKg: 80 }), set({ weightKg: 80 }), set({ weightKg: 70 })])).toBe(80);
  });

  it('breaks a tie toward the heavier load', () => {
    expect(sessionLoad([set({ weightKg: 70 }), set({ weightKg: 80 })])).toBe(80);
  });

  it('returns null when nothing usable was logged', () => {
    expect(sessionLoad([])).toBeNull();
    expect(sessionLoad([set({ reps: 0 })])).toBeNull();
  });
});

describe('computeProgression — double progression', () => {
  it('adds load once every set reaches the top of the range', () => {
    const result = computeProgression(input({ lastSession: [set({ reps: 12 }), set({ reps: 12 }), set({ reps: 12 })] }));

    expect(result.action).toBe('increase_load');
    expect(result.nextWeightKg).toBe(82.5);
    expect(result.blockedBy).toBeNull();
    expect(result.reason).toContain('82.5');
  });

  it('adds reps while any set is short of the top', () => {
    const result = computeProgression(input({ lastSession: [set({ reps: 12 }), set({ reps: 11 }), set({ reps: 10 })] }));

    expect(result.action).toBe('add_reps');
    expect(result.nextWeightKg).toBe(80);
    expect(result.reason).toContain('lowest set was 10');
  });

  it('reduces load when no set reaches the bottom of the range', () => {
    const result = computeProgression(input({ lastSession: [set({ reps: 6 }), set({ reps: 5 }), set({ reps: 5 })] }));

    expect(result.action).toBe('reduce_load');
    expect(result.nextWeightKg).toBe(77.5);
  });

  it('never prescribes a negative load', () => {
    const result = computeProgression(
      input({ loadIncrementKg: 5, lastSession: [set({ weightKg: 2, reps: 3 })] }),
    );
    expect(result.nextWeightKg).toBeGreaterThanOrEqual(0);
  });

  it('uses the exercise\'s own increment rather than a fixed step', () => {
    // A lateral raise moves in 1 kg jumps, not 2.5.
    const result = computeProgression(
      input({
        loadIncrementKg: 1,
        lastSession: [set({ weightKg: 12, reps: 12 }), set({ weightKg: 12, reps: 12 }), set({ weightKg: 12, reps: 12 })],
      }),
    );
    expect(result.nextWeightKg).toBe(13);
  });
});

describe('computeProgression — blocking conditions', () => {
  const topOfRange = [set({ reps: 12 }), set({ reps: 12 }), set({ reps: 12 })];

  it('blocks on reported pain, even with perfect reps', () => {
    const result = computeProgression(
      input({ lastSession: [...topOfRange.slice(0, 2), set({ reps: 12, painReported: true })] }),
    );

    expect(result.action).toBe('hold');
    expect(result.blockedBy).toBe('pain');
    expect(result.reason).toMatch(/pain/i);
  });

  it('blocks on technique breakdown', () => {
    const result = computeProgression(
      input({ lastSession: [...topOfRange.slice(0, 2), set({ reps: 12, techniqueBreakdown: true })] }),
    );

    expect(result.action).toBe('hold');
    expect(result.blockedBy).toBe('technique_breakdown');
  });

  it('blocks when RIR was badly undershot', () => {
    // 0 RIR reported against a prescribed 2: the set went to failure.
    const result = computeProgression(
      input({ lastSession: topOfRange.map((s) => ({ ...s, rir: 0 })) }),
    );

    expect(result.action).toBe('hold');
    expect(result.blockedBy).toBe('rir_undershoot');
    expect(result.reason).toContain('2 RIR');
  });

  it('tolerates a one-off RIR of 1 against a target of 2', () => {
    // Self-reported RIR is imprecise; being one out is noise, not a signal.
    const result = computeProgression(
      input({ lastSession: topOfRange.map((s) => ({ ...s, rir: 1 })) }),
    );
    expect(result.action).toBe('increase_load');
  });

  it('proceeds when RIR was not reported at all', () => {
    const result = computeProgression(
      input({ lastSession: topOfRange.map((s) => ({ ...s, rir: null })) }),
    );
    expect(result.action).toBe('increase_load');
  });

  it('blocks when performance is bouncing rather than trending', () => {
    const result = computeProgression(
      input({
        lastSession: topOfRange,
        previousSessions: [
          [set({ reps: 12 }), set({ reps: 12 }), set({ reps: 12 })],
          [set({ reps: 14 }), set({ reps: 14 }), set({ reps: 14 })],
        ],
      }),
    );
    // 36 reps against a recent best of 42 — a 14% drop.
    expect(result.action).toBe('hold');
    expect(result.blockedBy).toBe('unstable_performance');
  });

  it('does not call steady improvement unstable', () => {
    const result = computeProgression(
      input({
        lastSession: topOfRange,
        previousSessions: [
          [set({ reps: 11 }), set({ reps: 11 }), set({ reps: 10 })],
          [set({ reps: 10 }), set({ reps: 10 }), set({ reps: 9 })],
        ],
      }),
    );
    expect(result.action).toBe('increase_load');
  });

  it('reports insufficient data rather than guessing', () => {
    const result = computeProgression(input({ lastSession: [] }));
    expect(result.action).toBe('hold');
    expect(result.blockedBy).toBe('insufficient_data');
  });

  it('prioritises pain over every other block', () => {
    const result = computeProgression(
      input({
        lastSession: [set({ reps: 12, rir: 0, techniqueBreakdown: true, painReported: true })],
      }),
    );
    expect(result.blockedBy).toBe('pain');
  });

  it('always explains itself', () => {
    for (const session of [
      [set({ reps: 12, painReported: true })],
      [set({ reps: 12, techniqueBreakdown: true })],
      [set({ reps: 12, rir: 0 })],
      [set({ reps: 12 })],
      [set({ reps: 4 })],
      [],
    ]) {
      const result = computeProgression(input({ lastSession: session }));
      expect(result.reason.length).toBeGreaterThan(30);
    }
  });
});

describe('isPerformanceUnstable', () => {
  it('needs enough history before it judges', () => {
    expect(isPerformanceUnstable([set()], [[set()]])).toBe(false);
  });
});

describe('totalReps', () => {
  it('sums completed working reps', () => {
    expect(totalReps([set({ reps: 10 }), set({ reps: 8 }), set({ isCompleted: false, reps: 5 })])).toBe(18);
  });
});

describe('estimatedOneRepMax', () => {
  it('returns the load itself for a single', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
  });

  it('estimates from reps using Epley', () => {
    // 100 × (1 + 5/30) = 116.67
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(116.67, 1);
  });

  it('refuses beyond ten reps, where the estimate stops meaning much', () => {
    expect(estimatedOneRepMax(60, 20)).toBeNull();
  });

  it('rejects nonsense input', () => {
    expect(estimatedOneRepMax(0, 5)).toBeNull();
    expect(estimatedOneRepMax(100, 0)).toBeNull();
  });
});
