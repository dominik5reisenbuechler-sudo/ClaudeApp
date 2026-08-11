import { describe, expect, it } from 'vitest';

import { draftDefaults } from './schema';
import type { OnboardingDraft } from './schema';
import { canComputeTargets, draftToTargetInput, IncompleteDraftError } from './targetInput';
import { computeInitialTargets } from '@/domain/nutrition/targets';

const completeDraft: OnboardingDraft = {
  ...draftDefaults,
  displayName: 'Test',
  birthDate: '1995-06-15',
  sex: 'male',
  heightCm: 180,
  weightKg: 80,
  occupation: 'desk',
  activityLevel: 'moderate',
  averageDailySteps: 8000,
  experience: 'intermediate',
  trainingDaysPerWeek: 4,
  sessionMinutes: 60,
  dietType: 'omnivore',
  goal: 'lean_bulk',
};

describe('draftToTargetInput', () => {
  it('maps a complete draft', () => {
    const input = draftToTargetInput(completeDraft, '2025-06-15');
    expect(input).toMatchObject({
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
    });
  });

  it('derives age from the birth date rather than storing it', () => {
    expect(draftToTargetInput(completeDraft, '2025-06-14').ageYears).toBe(29);
    expect(draftToTargetInput(completeDraft, '2025-06-15').ageYears).toBe(30);
  });

  it('carries screening answers through to the safety guards', () => {
    const input = draftToTargetInput(
      { ...completeDraft, eatingDisorderRisk: true },
      '2025-06-15',
    );
    expect(input.screening?.eatingDisorderRisk).toBe(true);
  });

  it('defaults the optional body-fat fields rather than leaving them undefined', () => {
    const input = draftToTargetInput(completeDraft, '2025-06-15');
    expect(input.bodyFatPercent).toBeNull();
    expect(input.bodyFatIsMeasured).toBe(false);
  });

  it('throws rather than substituting a default for a missing field', () => {
    const { weightKg: _omitted, ...withoutWeight } = completeDraft;
    expect(() => draftToTargetInput(withoutWeight, '2025-06-15')).toThrow(IncompleteDraftError);
  });

  it('reports every missing field, not just the first', () => {
    try {
      draftToTargetInput(draftDefaults, '2025-06-15');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IncompleteDraftError);
      const missing = (error as IncompleteDraftError).missing;
      expect(missing).toContain('birthDate');
      expect(missing).toContain('sex');
      expect(missing).toContain('goal');
    }
  });

  it('produces an input the domain layer accepts end to end', () => {
    const result = computeInitialTargets(draftToTargetInput(completeDraft, '2025-06-15'));
    expect(result.energyKcal).toBeGreaterThan(1500);
    expect(result.macros.proteinG).toBeGreaterThan(100);
    expect(result.explanation.length).toBeGreaterThan(50);
  });
});

describe('canComputeTargets', () => {
  it('is false for a fresh draft and true for a complete one', () => {
    expect(canComputeTargets(draftDefaults)).toBe(false);
    expect(canComputeTargets(completeDraft)).toBe(true);
  });
});
