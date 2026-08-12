/**
 * Weekly training volume, counted with fractional set credits.
 *
 * A bench press is not "one set of chest". It trains chest through a full
 * range, and triceps and front delts substantially. Counting it as a whole set
 * for chest and nothing for the others understates arm volume; counting it as
 * a whole set for all three overstates everything. The credits live in
 * `exercise_muscles` as data (CLAUDE.md §31), and this module applies them.
 *
 * Only working sets count. Warm-ups are preparation, not stimulus — including
 * them would inflate every number and make the volume guidance meaningless.
 */

import { MUSCLE_IDS } from '@/types/domain';
import type { IsoDate, MuscleId, SetType } from '@/types/domain';
import { daysBetween } from '@/utils/date';

/** Set types that contribute to weekly volume. */
const COUNTED_SET_TYPES: ReadonlySet<SetType> = new Set<SetType>([
  'working',
  'backoff',
  'drop',
  'myo_rep',
  'amrap',
]);

export interface MuscleContribution {
  muscleId: MuscleId;
  setCredit: number;
}

export interface PerformedSet {
  exerciseId: string;
  setType: SetType;
  isCompleted: boolean;
  performedOn: IsoDate;
  /** Null when the user logged a set but no reps — it did not happen. */
  reps: number | null;
}

/** exerciseId → the muscles it credits, and by how much. */
export type ContributionMap = ReadonlyMap<string, readonly MuscleContribution[]>;

export function countsTowardVolume(set: PerformedSet): boolean {
  return set.isCompleted && COUNTED_SET_TYPES.has(set.setType) && (set.reps ?? 0) > 0;
}

/**
 * Fractional set counts per muscle across the supplied sets.
 *
 * Returns every muscle, including zeros: a dashboard needs to show that rear
 * delts got nothing this week just as much as it needs the chest number.
 */
export function weeklySetsByMuscle(
  sets: readonly PerformedSet[],
  contributions: ContributionMap,
): Record<MuscleId, number> {
  const totals = Object.fromEntries(MUSCLE_IDS.map((id) => [id, 0])) as Record<MuscleId, number>;

  for (const set of sets) {
    if (!countsTowardVolume(set)) continue;
    const credits = contributions.get(set.exerciseId);
    if (!credits) continue;

    for (const credit of credits) {
      totals[credit.muscleId] = round2(totals[credit.muscleId] + credit.setCredit);
    }
  }

  return totals;
}

/** Sets in the window ending on `weekEnd`, inclusive, spanning `days`. */
export function setsInWindow(
  sets: readonly PerformedSet[],
  weekEnd: IsoDate,
  days = 7,
): PerformedSet[] {
  return sets.filter((set) => {
    const age = daysBetween(set.performedOn, weekEnd);
    return age >= 0 && age < days;
  });
}

export type VolumeStatus = 'under' | 'in_range' | 'over';

export interface MuscleVolumeSummary {
  muscleId: MuscleId;
  sets: number;
  minSets: number;
  maxSets: number;
  status: VolumeStatus;
  /** Distinct days the muscle was trained. Frequency matters as well as volume. */
  frequency: number;
}

export interface MuscleTargets {
  minSets: number;
  maxSets: number;
}

/**
 * Compare a week's volume against each muscle's target band.
 *
 * `over` is reported but is not automatically a problem: an upper bound is a
 * prompt to check recovery, not a rule. The interpretation belongs to the
 * recommendation engine, which can see performance and recovery data too.
 */
export function summarizeWeeklyVolume(
  sets: readonly PerformedSet[],
  contributions: ContributionMap,
  targets: Partial<Record<MuscleId, MuscleTargets>>,
): MuscleVolumeSummary[] {
  const counted = sets.filter(countsTowardVolume);
  const totals = weeklySetsByMuscle(counted, contributions);

  const daysByMuscle = new Map<MuscleId, Set<IsoDate>>();
  for (const set of counted) {
    for (const credit of contributions.get(set.exerciseId) ?? []) {
      const days = daysByMuscle.get(credit.muscleId) ?? new Set<IsoDate>();
      days.add(set.performedOn);
      daysByMuscle.set(credit.muscleId, days);
    }
  }

  return MUSCLE_IDS.map((muscleId) => {
    const target = targets[muscleId] ?? { minSets: 8, maxSets: 12 };
    const value = totals[muscleId];

    return {
      muscleId,
      sets: value,
      minSets: target.minSets,
      maxSets: target.maxSets,
      status: value < target.minSets ? 'under' : value > target.maxSets ? 'over' : 'in_range',
      frequency: daysByMuscle.get(muscleId)?.size ?? 0,
    };
  });
}

/** Total working sets, ignoring which muscles they hit. */
export function totalWorkingSets(sets: readonly PerformedSet[]): number {
  return sets.filter(countsTowardVolume).length;
}

/**
 * Tonnage: load × reps, summed. A blunt instrument — it rewards heavy partials
 * and punishes a productive drop in load — so it is offered as one signal
 * among several, never as the measure of a session.
 */
export function sessionTonnage(
  sets: readonly (PerformedSet & { weightKg: number | null })[],
): number {
  return round2(
    sets
      .filter(countsTowardVolume)
      .reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
  );
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
