/**
 * Bodyweight smoothing and trend estimation.
 *
 * Daily bodyweight swings by 1–2 kg from hydration, sodium, glycogen, digestive
 * contents and cycle phase. A single weigh-in therefore carries almost no
 * information about tissue change, and **nothing in this app may react to one**
 * (SCIENTIFIC_RULES.md §5).
 *
 * Averaging is over a *calendar* window, not the last N samples. Someone who
 * weighs in twice a week would otherwise have a "7-day average" spanning three
 * and a half weeks — smooth, but no longer describing the present.
 */

import { addDays, daysBetween, isIsoDate } from '@/utils/date';
import { linearSlopeXY, mean } from '@/utils/number';
import type { IsoDate, WeightPoint } from '@/types/domain';

export const DEFAULT_WINDOW_DAYS = 7;
export const LONG_WINDOW_DAYS = 30;

/** Minimum weigh-ins inside a window before an average is meaningful. */
export const MIN_POINTS_FOR_AVERAGE = 2;

/** Minimum span before a rate of change is worth quoting, in days. */
export const MIN_DAYS_FOR_TREND = 10;

export interface TrendPoint {
  date: IsoDate;
  weightKg: number;
  /** Trailing average over the window ending on this date, or `null`. */
  averageKg: number | null;
}

/**
 * Sort ascending and collapse duplicate dates, keeping the last value for each
 * date. Duplicates are ordinary — a user corrects a typo by logging again.
 */
export function normalizeWeightPoints(points: readonly WeightPoint[]): WeightPoint[] {
  const byDate = new Map<IsoDate, number>();
  for (const point of points) {
    if (!isIsoDate(point.date)) continue;
    if (!Number.isFinite(point.weightKg) || point.weightKg <= 0) continue;
    byDate.set(point.date, point.weightKg);
  }
  return [...byDate.entries()]
    .map(([date, weightKg]) => ({ date, weightKg }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Trailing moving average at full precision. Kept private because the rounded
 * form is what belongs on screen — but rounding to 0.1 kg before differentiating
 * quantises the series and biases the resulting rate, so the trend calculation
 * consumes this instead.
 */
function smoothedSeries(
  points: readonly WeightPoint[],
  windowDays: number,
): TrendPoint[] {
  if (windowDays < 1) throw new Error('movingAverage: windowDays must be at least 1');
  const sorted = normalizeWeightPoints(points);

  return sorted.map((point) => {
    const windowStart = addDays(point.date, -(windowDays - 1));
    const inWindow = sorted
      .filter((candidate) => candidate.date >= windowStart && candidate.date <= point.date)
      .map((candidate) => candidate.weightKg);

    return {
      date: point.date,
      weightKg: point.weightKg,
      averageKg: inWindow.length >= MIN_POINTS_FOR_AVERAGE ? (mean(inWindow) as number) : null,
    };
  });
}

/**
 * Trailing moving average over `windowDays` calendar days, evaluated at each
 * date that has an observation. Averages are rounded to 0.1 kg for display.
 */
export function movingAverage(
  points: readonly WeightPoint[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
): TrendPoint[] {
  return smoothedSeries(points, windowDays).map((point) => ({
    ...point,
    averageKg: point.averageKg === null ? null : round1(point.averageKg),
  }));
}

/**
 * The trailing average as of `asOf` (default: the most recent observation).
 * Returns `null` when the window holds too few weigh-ins to smooth anything.
 */
export function averageAsOf(
  points: readonly WeightPoint[],
  asOf?: IsoDate,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): number | null {
  const sorted = normalizeWeightPoints(points);
  const last = sorted[sorted.length - 1];
  if (!last) return null;

  const end = asOf ?? last.date;
  const start = addDays(end, -(windowDays - 1));
  const inWindow = sorted
    .filter((p) => p.date >= start && p.date <= end)
    .map((p) => p.weightKg);

  if (inWindow.length < MIN_POINTS_FOR_AVERAGE) return null;
  return round1(mean(inWindow) as number);
}

export interface WeightTrend {
  /** Rate of change of the smoothed series, in kg per week. */
  kgPerWeek: number;
  /** Same rate as a percentage of the latest average weight, per week. */
  percentPerWeek: number;
  /** Calendar days spanned by the data used. */
  spanDays: number;
  /** Number of weigh-ins used. */
  sampleCount: number;
  latestAverageKg: number;
}

/**
 * Rate of weight change over `overDays`, computed from the *smoothed* series
 * so that a single outlying weigh-in at either end cannot swing the answer.
 *
 * Returns `null` when the data is too sparse or too short to support a claim —
 * an honest "not yet" rather than a confident number built on three data
 * points.
 */
export function weightTrend(
  points: readonly WeightPoint[],
  overDays = 21,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): WeightTrend | null {
  const smoothed = smoothedSeries(points, windowDays).filter(
    (p): p is TrendPoint & { averageKg: number } => p.averageKg !== null,
  );

  const first = smoothed[0];
  const last = smoothed[smoothed.length - 1];
  if (!first || !last) return null;

  const cutoff = addDays(last.date, -(overDays - 1));
  const recent = smoothed.filter((p) => p.date >= cutoff);

  const firstRecent = recent[0];
  const lastRecent = recent[recent.length - 1];
  if (!firstRecent || !lastRecent) return null;

  const spanDays = daysBetween(firstRecent.date, lastRecent.date);
  if (spanDays < MIN_DAYS_FOR_TREND || recent.length < 4) return null;

  // Regress the smoothed weight against the actual day offset, not the array
  // index. Weigh-ins arrive on whatever days the user steps on the scale, and
  // regressing against the index would give kg per weigh-in, not kg per day.
  const kgPerDay = linearSlopeXY(
    recent.map((p) => daysBetween(firstRecent.date, p.date)),
    recent.map((p) => p.averageKg),
  );
  if (kgPerDay === null) return null;

  const kgPerWeek = kgPerDay * 7;

  return {
    kgPerWeek: round2(kgPerWeek),
    percentPerWeek: round2((kgPerWeek / lastRecent.averageKg) * 100),
    spanDays,
    sampleCount: recent.length,
    latestAverageKg: round1(lastRecent.averageKg),
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;
