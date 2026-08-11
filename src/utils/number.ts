/**
 * Numeric helpers. Rounding rules matter here: targets are advice, and advice
 * printed to four significant figures implies an accuracy the underlying
 * estimates do not have (SCIENTIFIC_RULES.md §3.5).
 */

/** Round to the nearest multiple of `step`. `roundTo(2647, 10) === 2650`. */
export function roundTo(value: number, step: number): number {
  if (step <= 0) throw new Error('roundTo: step must be positive');
  return Math.round(value / step) * step;
}

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) throw new Error('clamp: min must not exceed max');
  return Math.min(Math.max(value, min), max);
}

/** Arithmetic mean. Returns `null` for an empty list rather than `NaN`. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

/**
 * Least-squares slope of `values` against their index, i.e. change per step.
 * Returns `null` when there are fewer than two points or no variance in x.
 */
export function linearSlope(values: readonly number[]): number | null {
  const n = values.length;
  if (n < 2) return null;

  const meanX = (n - 1) / 2;
  const meanY = mean(values);
  if (meanY === null) return null;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    numerator += dx * (values[i] as number - meanY);
    denominator += dx * dx;
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Least-squares slope of `ys` against `xs` — change in y per unit of x.
 *
 * The x-aware form matters wherever samples are irregularly spaced: weigh-ins
 * arrive on whatever days the user steps on the scale, so regressing against
 * the array index would answer "kg per weigh-in", not "kg per day".
 *
 * Returns `null` for mismatched lengths, fewer than two points, or no variance
 * in x.
 */
export function linearSlopeXY(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n !== ys.length || n < 2) return null;

  const meanX = mean(xs);
  const meanY = mean(ys);
  if (meanX === null || meanY === null) return null;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] as number) - meanX;
    numerator += dx * ((ys[i] as number) - meanY);
    denominator += dx * dx;
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Percentage of `part` relative to `whole`, clamped to `[0, cap]`. */
export function percentOf(part: number, whole: number, cap = 999): number {
  if (whole <= 0) return 0;
  return clamp((part / whole) * 100, 0, cap);
}
