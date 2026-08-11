import { describe, expect, it } from 'vitest';

import { computeInitialTargets, suggestStepGoal } from './targets';
import type { InitialTargetInput } from './targets';
import { MIN_KCAL_BY_SEX } from './safety';

const base: InitialTargetInput = {
  sex: 'male',
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  occupation: 'desk',
  activityLevel: 'moderate',
  averageDailySteps: 8000,
  experience: 'intermediate',
  trainingDaysPerWeek: 4,
  sessionMinutes: 60,
  goal: 'lean_bulk',
  dietType: 'omnivore',
};

describe('computeInitialTargets', () => {
  it('produces a coherent target for a typical user', () => {
    const result = computeInitialTargets(base);

    expect(result.bmr.equation).toBe('mifflin_st_jeor');
    expect(result.bmr.bmrKcal).toBe(1780);
    expect(result.tdee.isEstimate).toBe(true);
    expect(result.energyKcal).toBeGreaterThan(result.tdee.tdeeKcal);
    expect(result.macros.proteinG).toBeGreaterThan(0);
    expect(result.calorieFloorApplied).toBe(false);
    expect(result.safetyFlags).toEqual([]);
    expect(result.resolvedGoal).toBe('lean_bulk');
  });

  it('applies a deficit for a cut', () => {
    const result = computeInitialTargets({ ...base, goal: 'cut' });
    expect(result.energyKcal).toBeLessThan(result.tdee.tdeeKcal);
  });

  it('targets approximately maintenance for maintenance', () => {
    const result = computeInitialTargets({ ...base, goal: 'maintenance' });
    expect(Math.abs(result.energyKcal - result.tdee.tdeeKcal)).toBeLessThanOrEqual(10);
  });

  it('never returns a target below the safety floor', () => {
    const result = computeInitialTargets({
      ...base,
      sex: 'female',
      weightKg: 48,
      heightCm: 150,
      averageDailySteps: 2000,
      trainingDaysPerWeek: 2,
      sessionMinutes: 30,
      goal: 'cut',
    });
    expect(result.energyKcal).toBeGreaterThanOrEqual(MIN_KCAL_BY_SEX.female);
    expect(result.energyKcal).toBeGreaterThanOrEqual(result.floorKcal);
  });

  it('computes macros from the clamped calorie figure, not the unclamped one', () => {
    const result = computeInitialTargets({
      ...base,
      sex: 'female',
      weightKg: 45,
      heightCm: 155,
      averageDailySteps: 1500,
      trainingDaysPerWeek: 2,
      sessionMinutes: 30,
      goal: 'cut',
    });
    expect(result.macros.energyKcal).toBe(result.energyKcal);
  });

  it('will not put a minor into a deficit', () => {
    const result = computeInitialTargets({ ...base, ageYears: 16, goal: 'cut' });
    expect(result.resolvedGoal).toBe('maintenance');
    expect(result.requestedGoal).toBe('cut');
    expect(result.safetyFlags.map((f) => f.code)).toContain('minor');
    expect(result.energyKcal).toBeGreaterThanOrEqual(result.tdee.tdeeKcal - 10);
  });

  it('will not put an underweight user into a deficit', () => {
    const result = computeInitialTargets({
      ...base,
      weightKg: 55,
      heightCm: 185,
      goal: 'cut',
    });
    expect(result.safetyFlags.map((f) => f.code)).toContain('low_bmi');
    expect(result.resolvedGoal).toBe('maintenance');
  });

  it('still allows a bulk when a deficit is blocked', () => {
    const result = computeInitialTargets({ ...base, ageYears: 16, goal: 'lean_bulk' });
    expect(result.resolvedGoal).toBe('lean_bulk');
  });

  it('passes screening answers through', () => {
    const result = computeInitialTargets({
      ...base,
      screening: { hasMedicalCondition: true },
    });
    expect(result.safetyFlags.map((f) => f.code)).toContain('medical_condition');
    // A warning must not change the goal.
    expect(result.resolvedGoal).toBe('lean_bulk');
  });

  it('is deterministic', () => {
    const a = computeInitialTargets(base);
    const b = computeInitialTargets(base);
    expect(a).toEqual(b);
  });

  it('records a reproducible basis for the target', () => {
    const result = computeInitialTargets(base);
    const basis = result.basis as {
      version: number;
      inputs: Record<string, unknown>;
      derived: Record<string, unknown>;
    };
    expect(basis.version).toBe(1);
    expect(basis.inputs.weightKg).toBe(80);
    expect(basis.derived.bmrKcal).toBe(1780);
    // Must survive a round-trip through jsonb.
    expect(JSON.parse(JSON.stringify(basis))).toEqual(basis);
  });
});

describe('explanation', () => {
  it('cites the actual numbers used', () => {
    const result = computeInitialTargets(base);
    expect(result.explanation).toContain(String(result.tdee.tdeeKcal));
    expect(result.explanation).toContain(String(result.macros.proteinG));
    expect(result.explanation).toContain('Mifflin');
  });

  it('says out loud that the figure is an estimate', () => {
    expect(computeInitialTargets(base).explanation).toMatch(/estimate/i);
  });

  it('explains a goal that was overridden for safety', () => {
    const result = computeInitialTargets({ ...base, ageYears: 16, goal: 'cut' });
    expect(result.explanation).toMatch(/safety note/i);
  });

  it('explains a clamped calorie target', () => {
    const result = computeInitialTargets({
      ...base,
      sex: 'female',
      weightKg: 45,
      heightCm: 155,
      averageDailySteps: 1000,
      trainingDaysPerWeek: 2,
      sessionMinutes: 30,
      goal: 'cut',
    });
    if (result.calorieFloorApplied) {
      expect(result.explanation).toMatch(/minimum intake/i);
    }
  });
});

describe('suggestStepGoal', () => {
  it('nudges upward from the current average', () => {
    expect(suggestStepGoal(8000)).toBe(9000);
  });

  it('does not impose an unreachable goal on a low-step user', () => {
    expect(suggestStepGoal(1000)).toBe(6000);
  });

  it('does not impose a trivial goal on a high-step user', () => {
    expect(suggestStepGoal(20000)).toBe(14000);
  });

  it('rounds to a round number', () => {
    expect(suggestStepGoal(7350) % 500).toBe(0);
  });
});
