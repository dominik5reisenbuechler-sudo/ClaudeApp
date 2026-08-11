import { describe, expect, it } from 'vitest';

import {
  computeGoalTarget,
  goalEnergyOffset,
  isRateOnTarget,
  targetRateKgPerWeek,
  GOAL_RATE_BANDS,
} from './goalAdjustment';
import type { GoalTargetInput } from './goalAdjustment';
import { GOAL_TYPES } from '@/types/domain';

const base: GoalTargetInput = {
  goal: 'lean_bulk',
  tdeeKcal: 2600,
  weightKg: 80,
  experience: 'intermediate',
};

describe('goalEnergyOffset', () => {
  it('is a surplus for a lean bulk', () => {
    // 2600 × 0.10 × 0.85 (intermediate) = 221 → 220
    expect(goalEnergyOffset(base)).toBe(220);
  });

  it('is a deficit for a cut', () => {
    // 2600 × −0.20 = −520
    expect(goalEnergyOffset({ ...base, goal: 'cut' })).toBe(-520);
  });

  it('is zero for maintenance', () => {
    expect(goalEnergyOffset({ ...base, goal: 'maintenance' })).toBe(0);
  });

  it('shrinks the bulk surplus as experience rises', () => {
    const beginner = goalEnergyOffset({ ...base, experience: 'beginner' });
    const intermediate = goalEnergyOffset({ ...base, experience: 'intermediate' });
    const advanced = goalEnergyOffset({ ...base, experience: 'advanced' });
    expect(beginner).toBeGreaterThan(intermediate);
    expect(intermediate).toBeGreaterThan(advanced);
  });

  it('caps the surplus for a high-expenditure user', () => {
    const offset = goalEnergyOffset({ ...base, tdeeKcal: 5000, experience: 'beginner' });
    expect(offset).toBe(350);
  });

  it('caps the deficit for a high-expenditure user', () => {
    const offset = goalEnergyOffset({ ...base, tdeeKcal: 5000, goal: 'cut' });
    expect(offset).toBe(-750);
  });

  it('rounds to 10 kcal', () => {
    for (const goal of GOAL_TYPES) {
      expect(Math.abs(goalEnergyOffset({ ...base, goal }) % 10)).toBe(0);
    }
  });
});

describe('targetRateKgPerWeek', () => {
  it('scales with bodyweight rather than using a fixed kilogram figure', () => {
    const light = targetRateKgPerWeek('lean_bulk', 55);
    const heavy = targetRateKgPerWeek('lean_bulk', 110);
    expect(heavy).toBeCloseTo(light * 2, 6);
  });

  it('is negative for a cut and positive for a bulk', () => {
    expect(targetRateKgPerWeek('cut', 80)).toBeLessThan(0);
    expect(targetRateKgPerWeek('lean_bulk', 80)).toBeGreaterThan(0);
  });

  it('is approximately zero for maintenance', () => {
    expect(Math.abs(targetRateKgPerWeek('maintenance', 80))).toBeLessThan(0.01);
  });

  it('keeps a lean bulk conservative', () => {
    // Midpoint of 0.25–0.5 %/week at 80 kg is 0.3 kg/week.
    expect(targetRateKgPerWeek('lean_bulk', 80)).toBeCloseTo(0.3, 6);
  });
});

describe('computeGoalTarget', () => {
  it('reports the target and the band it came from', () => {
    const result = computeGoalTarget(base);
    expect(result.rawTargetKcal).toBe(2820);
    expect(result.rateBand).toEqual(GOAL_RATE_BANDS.lean_bulk);
  });
});

describe('isRateOnTarget', () => {
  it('accepts a rate inside the band', () => {
    // 0.3 kg/week at 80 kg = 0.375 %/week, inside 0.25–0.5.
    expect(isRateOnTarget('lean_bulk', 0.3, 80)).toBe(true);
  });

  it('rejects gaining too fast on a lean bulk', () => {
    expect(isRateOnTarget('lean_bulk', 0.8, 80)).toBe(false);
  });

  it('rejects a stall on a lean bulk', () => {
    expect(isRateOnTarget('lean_bulk', 0, 80)).toBe(false);
  });

  it('accepts a stable weight on maintenance', () => {
    expect(isRateOnTarget('maintenance', 0, 80)).toBe(true);
  });

  it('rejects losing weight on a cut too aggressively', () => {
    expect(isRateOnTarget('cut', -1.5, 80)).toBe(false);
  });

  it('accepts a reasonable cut rate', () => {
    expect(isRateOnTarget('cut', -0.6, 80)).toBe(true);
  });

  it('tolerates small measurement noise at the band edge', () => {
    // 0.24 %/week is just under the 0.25 % lower bound of a lean bulk.
    expect(isRateOnTarget('lean_bulk', 0.192, 80)).toBe(true);
  });
});
