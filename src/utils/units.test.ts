import { describe, expect, it } from 'vitest';

import {
  addQuantities,
  areCompatible,
  cmToFeetInches,
  convert,
  feetInchesToCm,
  isUnit,
  kgToLb,
  lbToKg,
} from './units';

describe('isUnit', () => {
  it('recognises known units and rejects others', () => {
    expect(isUnit('g')).toBe(true);
    expect(isUnit('tbsp')).toBe(true);
    expect(isUnit('handful')).toBe(false);
  });
});

describe('areCompatible', () => {
  it('allows conversion inside a dimension', () => {
    expect(areCompatible('g', 'kg')).toBe(true);
    expect(areCompatible('ml', 'l')).toBe(true);
    expect(areCompatible('tsp', 'cup')).toBe(true);
  });

  it('refuses across dimensions', () => {
    expect(areCompatible('g', 'ml')).toBe(false);
    expect(areCompatible('piece', 'g')).toBe(false);
  });

  it('treats distinct count units as incompatible', () => {
    expect(areCompatible('piece', 'slice')).toBe(false);
    expect(areCompatible('clove', 'clove')).toBe(true);
  });
});

describe('convert', () => {
  it('converts mass', () => {
    expect(convert(1, 'kg', 'g')).toBe(1000);
    expect(convert(500, 'g', 'kg')).toBe(0.5);
    expect(convert(1, 'lb', 'g')).toBeCloseTo(453.592, 3);
    expect(convert(1, 'oz', 'g')).toBeCloseTo(28.35, 2);
  });

  it('converts volume', () => {
    expect(convert(1, 'l', 'ml')).toBe(1000);
    expect(convert(3, 'tsp', 'tbsp')).toBeCloseTo(1, 10);
  });

  it('throws instead of guessing across dimensions', () => {
    expect(() => convert(100, 'g', 'ml')).toThrow(/incompatible/);
  });
});

describe('addQuantities', () => {
  it('aggregates the shopping-list case from the spec', () => {
    // 200 g + 180 g + 220 g chicken across three meals.
    expect(
      addQuantities([
        { amount: 200, unit: 'g' },
        { amount: 180, unit: 'g' },
        { amount: 220, unit: 'g' },
      ]),
    ).toEqual({ amount: 600, unit: 'g' });
  });

  it('normalises mixed mass units and promotes to kg past 1000 g', () => {
    expect(
      addQuantities([
        { amount: 500, unit: 'g' },
        { amount: 0.5, unit: 'kg' },
      ]),
    ).toEqual({ amount: 1, unit: 'kg' });
  });

  it('promotes volume to litres past 1000 ml', () => {
    expect(
      addQuantities([
        { amount: 750, unit: 'ml' },
        { amount: 0.5, unit: 'l' },
      ]),
    ).toEqual({ amount: 1.25, unit: 'l' });
  });

  it('sums count units without conversion', () => {
    expect(
      addQuantities([
        { amount: 2, unit: 'piece' },
        { amount: 3, unit: 'piece' },
      ]),
    ).toEqual({ amount: 5, unit: 'piece' });
  });

  it('returns null rather than merging incompatible units', () => {
    expect(
      addQuantities([
        { amount: 100, unit: 'g' },
        { amount: 1, unit: 'piece' },
      ]),
    ).toBeNull();
    expect(
      addQuantities([
        { amount: 1, unit: 'piece' },
        { amount: 1, unit: 'slice' },
      ]),
    ).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(addQuantities([])).toBeNull();
  });

  it('rounds to two decimals so the result is readable in a supermarket', () => {
    const result = addQuantities([
      { amount: 1, unit: 'tsp' },
      { amount: 1, unit: 'tbsp' },
    ]);
    expect(result).toEqual({ amount: 19.72, unit: 'ml' });
  });
});

describe('body-measurement conversions', () => {
  it('round-trips weight', () => {
    expect(lbToKg(kgToLb(82.4))).toBeCloseTo(82.4, 10);
  });

  it('converts height', () => {
    expect(feetInchesToCm(5, 11)).toBeCloseTo(180.34, 2);
    expect(cmToFeetInches(180.34)).toEqual({ feet: 5, inches: 11 });
  });
});
