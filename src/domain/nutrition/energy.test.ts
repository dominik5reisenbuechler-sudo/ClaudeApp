import { describe, expect, it } from 'vitest';

import { estimateBmr, estimateInitialTdee, katchMcArdle, mifflinStJeor } from './energy';

describe('mifflinStJeor', () => {
  it('matches the published equation for a male', () => {
    // 10(80) + 6.25(180) − 5(30) + 5 = 1780
    expect(mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780);
  });

  it('matches the published equation for a female', () => {
    // 10(65) + 6.25(165) − 5(28) − 161 = 1380.25
    expect(mifflinStJeor({ sex: 'female', weightKg: 65, heightCm: 165, ageYears: 28 })).toBeCloseTo(
      1380.25,
      6,
    );
  });

  it('decreases with age', () => {
    const young = mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 25 });
    const old = mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 55 });
    expect(old).toBeLessThan(young);
  });
});

describe('katchMcArdle', () => {
  it('matches the published equation', () => {
    // LBM = 80 × 0.85 = 68 → 370 + 21.6(68) = 1838.8
    expect(katchMcArdle({ weightKg: 80, bodyFatPercent: 15 })).toBeCloseTo(1838.8, 6);
  });

  it('is driven by lean mass, so two people at the same weight differ', () => {
    const leaner = katchMcArdle({ weightKg: 80, bodyFatPercent: 12 });
    const fatter = katchMcArdle({ weightKg: 80, bodyFatPercent: 30 });
    expect(leaner).toBeGreaterThan(fatter);
  });
});

describe('estimateBmr', () => {
  const base = { sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 } as const;

  it('defaults to Mifflin–St Jeor', () => {
    const result = estimateBmr(base);
    expect(result.equation).toBe('mifflin_st_jeor');
    expect(result.bmrKcal).toBe(1780);
  });

  it('uses Katch–McArdle only when body fat is genuinely measured', () => {
    const result = estimateBmr({ ...base, bodyFatPercent: 15, bodyFatIsMeasured: true });
    expect(result.equation).toBe('katch_mcardle');
  });

  it('ignores a self-estimated body-fat figure', () => {
    // A guess must not silently change the user's calorie target.
    const result = estimateBmr({ ...base, bodyFatPercent: 15, bodyFatIsMeasured: false });
    expect(result.equation).toBe('mifflin_st_jeor');
  });

  it('ignores implausible measured values', () => {
    expect(estimateBmr({ ...base, bodyFatPercent: 1, bodyFatIsMeasured: true }).equation).toBe(
      'mifflin_st_jeor',
    );
    expect(estimateBmr({ ...base, bodyFatPercent: 75, bodyFatIsMeasured: true }).equation).toBe(
      'mifflin_st_jeor',
    );
  });
});

describe('estimateInitialTdee', () => {
  const base = {
    bmrKcal: 1780,
    weightKg: 80,
    occupation: 'desk',
    activityLevel: 'sedentary',
    averageDailySteps: 8000,
    trainingDaysPerWeek: 4,
    sessionMinutes: 60,
  } as const;

  it('builds the total additively from named components', () => {
    const result = estimateInitialTdee(base);
    // baseline 1780 × 1.15 = 2047
    expect(result.baselineKcal).toBe(2047);
    // (8000 − 3000)/1000 × 0.04 × 80 = 16
    expect(result.stepsKcal).toBe(16);
    // 4 × 60 × 5 / 7 ≈ 171
    expect(result.trainingKcal).toBe(171);
    expect(result.cardioKcal).toBe(0);
    expect(result.tdeeKcal).toBe(2230);
  });

  it('always labels itself an estimate', () => {
    expect(estimateInitialTdee(base).isEstimate).toBe(true);
  });

  it('does not count steps below the baseline', () => {
    const low = estimateInitialTdee({ ...base, averageDailySteps: 2000 });
    const atBaseline = estimateInitialTdee({ ...base, averageDailySteps: 3000 });
    expect(low.stepsKcal).toBe(0);
    expect(atBaseline.stepsKcal).toBe(0);
  });

  it('scales step energy with bodyweight', () => {
    const light = estimateInitialTdee({ ...base, weightKg: 60 });
    const heavy = estimateInitialTdee({ ...base, weightKg: 100 });
    expect(heavy.stepsKcal).toBeGreaterThan(light.stepsKcal);
  });

  it('increases with a more active occupation', () => {
    const desk = estimateInitialTdee(base);
    const manual = estimateInitialTdee({ ...base, occupation: 'manual' });
    expect(manual.tdeeKcal).toBeGreaterThan(desk.tdeeKcal);
  });

  it('adds only a modest amount for leisure activity, to avoid double counting', () => {
    const sedentary = estimateInitialTdee(base);
    const veryHigh = estimateInitialTdee({ ...base, activityLevel: 'very_high' });
    const delta = veryHigh.tdeeKcal - sedentary.tdeeKcal;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(base.bmrKcal * 0.15);
  });

  it('amortises weekly cardio across seven days', () => {
    const withCardio = estimateInitialTdee({ ...base, cardioMinutesPerWeek: 140 });
    // 140 × 0.075 × 80 / 7 = 120
    expect(withCardio.cardioKcal).toBe(120);
  });

  it('rounds the total to 10 kcal', () => {
    expect(estimateInitialTdee(base).tdeeKcal % 10).toBe(0);
  });

  it('handles a user who does not train at all', () => {
    const result = estimateInitialTdee({ ...base, trainingDaysPerWeek: 0, sessionMinutes: 0 });
    expect(result.trainingKcal).toBe(0);
    expect(result.tdeeKcal).toBeGreaterThan(0);
  });
});
