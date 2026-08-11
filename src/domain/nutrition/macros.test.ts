import { describe, expect, it } from 'vitest';

import {
  computeMacroTargets,
  energyFromMacros,
  fiberTargetG,
  proteinReferenceWeightKg,
  FAT_MIN_G_PER_KG,
} from './macros';
import type { MacroTargetInput } from './macros';

const base: MacroTargetInput = {
  energyKcal: 2600,
  weightKg: 80,
  goal: 'lean_bulk',
  dietType: 'omnivore',
};

describe('computeMacroTargets', () => {
  it('produces the documented breakdown for a typical lean bulk', () => {
    const result = computeMacroTargets(base);
    // protein 1.9 g/kg × 80 = 152 → 150 (5 g rounding)
    expect(result.proteinG).toBe(150);
    // fat 27.5% of 2600 / 9 = 79.4 → 80
    expect(result.fatG).toBe(80);
    // carbs take the remainder
    expect(result.carbsG).toBe(320);
    // fibre 14 g per 1000 kcal = 36.4 → 35
    expect(result.fiberG).toBe(35);
    expect(result.energyKcal).toBe(2600);
  });

  it('rounds macros to 5 g and calories to 10 kcal', () => {
    const result = computeMacroTargets({ ...base, energyKcal: 2647 });
    expect(result.energyKcal % 10).toBe(0);
    expect(result.proteinG % 5).toBe(0);
    expect(result.carbsG % 5).toBe(0);
    expect(result.fatG % 5).toBe(0);
  });

  it('lands within a few percent of the energy budget after rounding', () => {
    const result = computeMacroTargets(base);
    const fromMacros = energyFromMacros(result);
    expect(Math.abs(fromMacros - result.energyKcal)).toBeLessThan(50);
  });

  it('raises protein on a cut', () => {
    const bulk = computeMacroTargets({ ...base, goal: 'lean_bulk' });
    const cut = computeMacroTargets({ ...base, goal: 'cut' });
    expect(cut.proteinG).toBeGreaterThan(bulk.proteinG);
  });

  it('raises protein slightly for plant-forward diets', () => {
    const omnivore = computeMacroTargets({ ...base, dietType: 'omnivore' });
    const vegan = computeMacroTargets({ ...base, dietType: 'vegan' });
    expect(vegan.proteinG).toBeGreaterThan(omnivore.proteinG);
  });

  it('honours the protein band position', () => {
    const low = computeMacroTargets({ ...base, proteinBandPosition: 0 });
    const high = computeMacroTargets({ ...base, proteinBandPosition: 1 });
    expect(low.proteinGPerKg).toBeCloseTo(1.6, 2);
    expect(high.proteinGPerKg).toBeCloseTo(2.2, 2);
  });

  it('clamps an out-of-range band position instead of extrapolating', () => {
    const result = computeMacroTargets({ ...base, proteinBandPosition: 5 });
    expect(result.proteinGPerKg).toBeCloseTo(2.2, 2);
  });

  it('never drops fat below the floor, even when carbs are asked to grow', () => {
    const result = computeMacroTargets({
      ...base,
      energyKcal: 1500,
      weightKg: 100,
      fatPercentOfEnergy: 10,
    });
    expect(result.fatFloorApplied).toBe(true);
    expect(result.fatG).toBeGreaterThanOrEqual(100 * FAT_MIN_G_PER_KG);
  });

  it('flags an energy budget too small to hold protein and fat', () => {
    const result = computeMacroTargets({
      ...base,
      energyKcal: 800,
      weightKg: 100,
      goal: 'cut',
    });
    expect(result.energyBudgetExceeded).toBe(true);
    expect(result.carbsG).toBe(0);
  });

  it('does not produce negative carbohydrate', () => {
    const result = computeMacroTargets({ ...base, energyKcal: 500, weightKg: 120, goal: 'cut' });
    expect(result.carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe('proteinReferenceWeightKg', () => {
  it('uses total bodyweight at normal body-fat levels', () => {
    expect(proteinReferenceWeightKg(80, 15)).toBe(80);
    expect(proteinReferenceWeightKg(80, null)).toBe(80);
    expect(proteinReferenceWeightKg(80)).toBe(80);
  });

  it('discounts weight at high body fat so the target stays sensible', () => {
    const reference = proteinReferenceWeightKg(120, 40);
    expect(reference).toBeLessThan(120);
    // lean 72 kg + a quarter of the 48 kg fat mass = 84 kg
    expect(reference).toBeCloseTo(84, 6);
  });
});

describe('fiberTargetG', () => {
  it('scales with energy', () => {
    expect(fiberTargetG(2000)).toBeCloseTo(28, 6);
    expect(fiberTargetG(3000)).toBeCloseTo(42, 6);
  });

  it('caps at a practical maximum', () => {
    expect(fiberTargetG(6000)).toBe(50);
  });
});

describe('energyFromMacros', () => {
  it('uses Atwater factors', () => {
    expect(energyFromMacros({ proteinG: 100, carbsG: 100, fatG: 100 })).toBe(1700);
  });
});
