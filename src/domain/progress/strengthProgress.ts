/**
 * Strength progression over time, per exercise.
 *
 * Reduces each session to one comparable number — the best estimated 1RM of
 * its working sets — so a chart can show a trend across changing rep ranges.
 * That reduction is lossy and the module says so: an estimate from a set of
 * ten is a weaker claim than one from a set of three, and neither is a tested
 * max.
 *
 * No claims are made about muscle growth from these numbers (CLAUDE.md §45).
 * Strength is what was measured; size is not.
 */

import { estimatedOneRepMax } from '../training/progression';
import { linearSlopeXY } from '@/utils/number';
import { daysBetween } from '@/utils/date';
import type { IsoDate, SetType } from '@/types/domain';

export interface StrengthSet {
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  isCompleted: boolean;
  performedOn: IsoDate;
}

export interface StrengthPoint {
  date: IsoDate;
  /** Best estimated 1RM across the session's working sets. */
  estimatedOneRm: number;
  /** The set it came from, for context. */
  weightKg: number;
  reps: number;
}

export interface StrengthTrend {
  exerciseId: string;
  points: StrengthPoint[];
  /** Change in estimated 1RM per week. Null when there is too little history. */
  kgPerWeek: number | null;
  first: StrengthPoint | null;
  latest: StrengthPoint | null;
  /** Total change from first to latest, in kg. */
  totalChangeKg: number | null;
}

/** Sessions need this many points before a rate is worth quoting. */
const MIN_POINTS_FOR_TREND = 3;
/** …and this many days, so three sessions in one week do not imply a rate. */
const MIN_DAYS_FOR_TREND = 14;

function isUsable(set: StrengthSet): boolean {
  return (
    set.isCompleted &&
    set.setType !== 'warmup' &&
    (set.weightKg ?? 0) > 0 &&
    (set.reps ?? 0) > 0
  );
}

/**
 * One point per training day: the best estimated 1RM achieved that day.
 *
 * Sets beyond ten reps contribute nothing, because the estimator refuses
 * there — a set of twenty says more about endurance than about strength.
 */
export function strengthSeries(
  sets: readonly StrengthSet[],
  exerciseId: string,
): StrengthPoint[] {
  const bestByDate = new Map<IsoDate, StrengthPoint>();

  for (const set of sets) {
    if (set.exerciseId !== exerciseId || !isUsable(set)) continue;

    const weightKg = set.weightKg as number;
    const reps = set.reps as number;
    const estimate = estimatedOneRepMax(weightKg, reps);
    if (estimate === null) continue;

    const current = bestByDate.get(set.performedOn);
    if (!current || estimate > current.estimatedOneRm) {
      bestByDate.set(set.performedOn, {
        date: set.performedOn,
        estimatedOneRm: estimate,
        weightKg,
        reps,
      });
    }
  }

  return [...bestByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function strengthTrend(
  sets: readonly StrengthSet[],
  exerciseId: string,
): StrengthTrend {
  const points = strengthSeries(sets, exerciseId);
  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;

  const base: StrengthTrend = {
    exerciseId,
    points,
    kgPerWeek: null,
    first,
    latest,
    totalChangeKg:
      first && latest ? round2(latest.estimatedOneRm - first.estimatedOneRm) : null,
  };

  if (!first || !latest || points.length < MIN_POINTS_FOR_TREND) return base;

  const span = daysBetween(first.date, latest.date);
  if (span < MIN_DAYS_FOR_TREND) return base;

  const kgPerDay = linearSlopeXY(
    points.map((point) => daysBetween(first.date, point.date)),
    points.map((point) => point.estimatedOneRm),
  );
  if (kgPerDay === null) return base;

  return { ...base, kgPerWeek: round2(kgPerDay * 7) };
}

/** Exercises with enough logged history to be worth charting, most-trained first. */
export function trackedExercises(sets: readonly StrengthSet[], minSessions = 2): string[] {
  const daysByExercise = new Map<string, Set<IsoDate>>();

  for (const set of sets) {
    if (!isUsable(set)) continue;
    const days = daysByExercise.get(set.exerciseId) ?? new Set<IsoDate>();
    days.add(set.performedOn);
    daysByExercise.set(set.exerciseId, days);
  }

  return [...daysByExercise.entries()]
    .filter(([, days]) => days.size >= minSessions)
    .sort((a, b) => {
      if (b[1].size !== a[1].size) return b[1].size - a[1].size;
      return a[0].localeCompare(b[0]);
    })
    .map(([exerciseId]) => exerciseId);
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
