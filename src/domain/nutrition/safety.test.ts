import { describe, expect, it } from 'vitest';

import {
  blocksDeficit,
  bmi,
  calorieFloor,
  enforceCalorieFloor,
  resolveSafeGoal,
  screenForSafety,
  MIN_KCAL_BY_SEX,
} from './safety';

const healthyAdult = {
  ageYears: 30,
  sex: 'male',
  weightKg: 80,
  heightCm: 180,
} as const;

describe('bmi', () => {
  it('computes body mass index', () => {
    expect(bmi(80, 180)).toBeCloseTo(24.69, 2);
  });

  it('rejects a non-positive height rather than returning Infinity', () => {
    expect(() => bmi(80, 0)).toThrow();
  });
});

describe('screenForSafety', () => {
  it('returns no flags for a healthy adult', () => {
    expect(screenForSafety(healthyAdult)).toEqual([]);
  });

  it('blocks a deficit for a minor', () => {
    const flags = screenForSafety({ ...healthyAdult, ageYears: 16 });
    expect(flags.map((f) => f.code)).toContain('minor');
    expect(blocksDeficit(flags)).toBe(true);
  });

  it('blocks a deficit during pregnancy or breastfeeding', () => {
    const flags = screenForSafety({ ...healthyAdult, isPregnantOrBreastfeeding: true });
    expect(flags.map((f) => f.code)).toContain('pregnancy_or_breastfeeding');
    expect(blocksDeficit(flags)).toBe(true);
  });

  it('blocks a deficit below a BMI of 18.5', () => {
    const flags = screenForSafety({ ...healthyAdult, weightKg: 52, heightCm: 180 });
    expect(flags.map((f) => f.code)).toContain('low_bmi');
    expect(blocksDeficit(flags)).toBe(true);
  });

  it('blocks a deficit on eating-disorder risk', () => {
    const flags = screenForSafety({ ...healthyAdult, eatingDisorderRisk: true });
    expect(blocksDeficit(flags)).toBe(true);
  });

  it('warns but does not block for a medical condition', () => {
    const flags = screenForSafety({ ...healthyAdult, hasMedicalCondition: true });
    expect(flags).toHaveLength(1);
    expect(flags[0]?.severity).toBe('warn');
    expect(blocksDeficit(flags)).toBe(false);
  });

  it('warns on acute symptoms', () => {
    const flags = screenForSafety({ ...healthyAdult, reportsAcuteSymptoms: true });
    expect(flags.map((f) => f.code)).toContain('acute_symptoms');
  });

  it('reports every applicable reason, not just the first', () => {
    const flags = screenForSafety({
      ...healthyAdult,
      ageYears: 16,
      weightKg: 50,
      hasMedicalCondition: true,
    });
    expect(flags.map((f) => f.code).sort()).toEqual(['low_bmi', 'medical_condition', 'minor']);
  });

  it('gives every flag an explanatory message', () => {
    const flags = screenForSafety({ ...healthyAdult, ageYears: 16 });
    for (const flag of flags) expect(flag.message.length).toBeGreaterThan(20);
  });
});

describe('calorieFloor', () => {
  it('uses the absolute floor when BMR is low', () => {
    expect(calorieFloor('female', 1000)).toBe(MIN_KCAL_BY_SEX.female);
  });

  it('uses the BMR multiple when BMR is high', () => {
    expect(calorieFloor('male', 2000)).toBe(2200);
  });
});

describe('enforceCalorieFloor', () => {
  it('passes through a target above the floor', () => {
    const result = enforceCalorieFloor(2400, 'male', 1800);
    expect(result.wasClamped).toBe(false);
    expect(result.energyKcal).toBe(2400);
  });

  it('raises a target below the floor and says so', () => {
    const result = enforceCalorieFloor(1200, 'male', 1800);
    expect(result.wasClamped).toBe(true);
    expect(result.energyKcal).toBe(1980);
    expect(result.energyKcal).toBe(result.floorKcal);
  });

  it('never returns below the absolute minimum for the sex', () => {
    const result = enforceCalorieFloor(600, 'female', 900);
    expect(result.energyKcal).toBeGreaterThanOrEqual(MIN_KCAL_BY_SEX.female);
  });
});

describe('resolveSafeGoal', () => {
  const blocking = screenForSafety({ ...healthyAdult, ageYears: 15 });

  it('leaves the goal alone when nothing is flagged', () => {
    expect(resolveSafeGoal('cut', [])).toBe('cut');
  });

  it('moves a cut to maintenance rather than refusing outright', () => {
    expect(resolveSafeGoal('cut', blocking)).toBe('maintenance');
    expect(resolveSafeGoal('recomposition', blocking)).toBe('maintenance');
  });

  it('leaves non-deficit goals untouched', () => {
    expect(resolveSafeGoal('lean_bulk', blocking)).toBe('lean_bulk');
    expect(resolveSafeGoal('maintenance', blocking)).toBe('maintenance');
  });
});
