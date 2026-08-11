import { describe, expect, it } from 'vitest';

import { clamp, linearSlope, linearSlopeXY, mean, percentOf, roundTo } from './number';

describe('roundTo', () => {
  it('rounds to the nearest multiple', () => {
    expect(roundTo(2647, 10)).toBe(2650);
    expect(roundTo(2644, 10)).toBe(2640);
    expect(roundTo(173.4, 5)).toBe(175);
    expect(roundTo(172, 5)).toBe(170);
  });

  it('handles negatives and zero', () => {
    expect(roundTo(-104, 10)).toBe(-100);
    expect(roundTo(0, 10)).toBe(0);
  });

  it('rejects a non-positive step', () => {
    expect(() => roundTo(10, 0)).toThrow();
    expect(() => roundTo(10, -5)).toThrow();
  });
});

describe('clamp', () => {
  it('bounds the value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('rejects an inverted range', () => {
    expect(() => clamp(5, 10, 0)).toThrow();
  });
});

describe('mean', () => {
  it('averages', () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  it('returns null rather than NaN for an empty list', () => {
    expect(mean([])).toBeNull();
  });
});

describe('linearSlope', () => {
  it('recovers the slope of a perfect line', () => {
    expect(linearSlope([1, 2, 3, 4, 5])).toBeCloseTo(1, 10);
    expect(linearSlope([10, 8, 6, 4])).toBeCloseTo(-2, 10);
  });

  it('is zero for a flat series', () => {
    expect(linearSlope([5, 5, 5, 5])).toBe(0);
  });

  it('needs at least two points', () => {
    expect(linearSlope([])).toBeNull();
    expect(linearSlope([1])).toBeNull();
  });
});

describe('linearSlopeXY', () => {
  it('recovers the slope of a perfect line', () => {
    expect(linearSlopeXY([0, 1, 2, 3], [10, 12, 14, 16])).toBeCloseTo(2, 10);
  });

  it('accounts for irregular x spacing', () => {
    // Same y values, but the x gaps differ: the per-x slope must differ too.
    const even = linearSlopeXY([0, 1, 2, 3], [80, 81, 82, 83]);
    const uneven = linearSlopeXY([0, 2, 4, 6], [80, 81, 82, 83]);
    expect(even).toBeCloseTo(1, 10);
    expect(uneven).toBeCloseTo(0.5, 10);
  });

  it('is zero for a flat series', () => {
    expect(linearSlopeXY([0, 3, 9], [80, 80, 80])).toBe(0);
  });

  it('returns null on mismatched lengths, too few points, or no x variance', () => {
    expect(linearSlopeXY([0, 1], [1])).toBeNull();
    expect(linearSlopeXY([0], [1])).toBeNull();
    expect(linearSlopeXY([2, 2, 2], [1, 2, 3])).toBeNull();
  });
});

describe('percentOf', () => {
  it('computes a percentage', () => {
    expect(percentOf(50, 200)).toBe(25);
  });

  it('returns 0 when the whole is zero, instead of dividing by zero', () => {
    expect(percentOf(50, 0)).toBe(0);
  });

  it('caps overshoot', () => {
    expect(percentOf(300, 100, 150)).toBe(150);
  });
});
