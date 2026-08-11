/**
 * Unit handling and conversion.
 *
 * Shopping-list aggregation depends on this: `500 g + 0.5 kg` must become
 * `1 kg`, while `2 tbsp + 1 piece` must stay two separate lines. Merging
 * incompatible units silently would produce a shopping list that is confidently
 * wrong, which is worse than one that is verbose.
 */

export const MASS_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
export const VOLUME_UNITS = ['ml', 'l', 'tsp', 'tbsp', 'cup'] as const;
export const COUNT_UNITS = ['piece', 'slice', 'clove', 'pinch'] as const;

export type MassUnit = (typeof MASS_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type CountUnit = (typeof COUNT_UNITS)[number];
export type Unit = MassUnit | VolumeUnit | CountUnit;

export type UnitDimension = 'mass' | 'volume' | 'count';

export interface Quantity {
  amount: number;
  unit: Unit;
}

/** Conversion factors to each dimension's base unit (g, ml, piece). */
const TO_BASE: Record<Unit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
  ml: 1,
  l: 1000,
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  cup: 236.5882365,
  piece: 1,
  slice: 1,
  clove: 1,
  pinch: 1,
};

const DIMENSIONS: Record<Unit, UnitDimension> = {
  g: 'mass',
  kg: 'mass',
  oz: 'mass',
  lb: 'mass',
  ml: 'volume',
  l: 'volume',
  tsp: 'volume',
  tbsp: 'volume',
  cup: 'volume',
  piece: 'count',
  slice: 'count',
  clove: 'count',
  pinch: 'count',
};

export function isUnit(value: string): value is Unit {
  return value in DIMENSIONS;
}

export function dimensionOf(unit: Unit): UnitDimension {
  return DIMENSIONS[unit];
}

/**
 * Count units are dimensionally "count" but are not interchangeable: a slice is
 * not a clove. They are only compatible with themselves.
 */
export function areCompatible(a: Unit, b: Unit): boolean {
  const dimensionA = DIMENSIONS[a];
  if (dimensionA !== DIMENSIONS[b]) return false;
  if (dimensionA === 'count') return a === b;
  return true;
}

/** Convert `amount` from `from` to `to`. Throws on incompatible units. */
export function convert(amount: number, from: Unit, to: Unit): number {
  if (!areCompatible(from, to)) {
    throw new Error(`convert: cannot convert ${from} to ${to} — incompatible units`);
  }
  return (amount * TO_BASE[from]) / TO_BASE[to];
}

/**
 * Sum quantities that share a dimension, returning the result in a unit a human
 * would actually write: grams below 1 kg, kilograms above; millilitres below
 * 1 l, litres above. Count units keep their own unit.
 *
 * Returns `null` if the quantities are not mutually compatible — callers must
 * keep them as separate lines rather than guessing a conversion.
 */
export function addQuantities(quantities: readonly Quantity[]): Quantity | null {
  const first = quantities[0];
  if (!first) return null;

  for (const q of quantities) {
    if (!areCompatible(first.unit, q.unit)) return null;
  }

  const dimension = DIMENSIONS[first.unit];

  if (dimension === 'count') {
    const amount = quantities.reduce((sum, q) => sum + q.amount, 0);
    return { amount, unit: first.unit };
  }

  const baseUnit: Unit = dimension === 'mass' ? 'g' : 'ml';
  const totalBase = quantities.reduce((sum, q) => sum + convert(q.amount, q.unit, baseUnit), 0);

  if (totalBase >= 1000) {
    const largeUnit: Unit = dimension === 'mass' ? 'kg' : 'l';
    return { amount: roundQuantity(totalBase / 1000), unit: largeUnit };
  }
  return { amount: roundQuantity(totalBase), unit: baseUnit };
}

/**
 * Quantities are rounded to two decimals. Shopping lists are read in a
 * supermarket, not a laboratory: `0.92 kg` is actionable, `0.9183333 kg` is not.
 */
function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;

/** Feet + inches to centimetres, for imperial height entry. */
export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * 12 + inches);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToInches(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}
