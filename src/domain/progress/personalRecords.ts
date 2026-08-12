/**
 * Personal record detection.
 *
 * Three kinds, because "my best bench" means different things to different
 * people and each answers a different question:
 *
 *   - `estimated_1rm`  — the best single the set implies. Comparable across
 *                        rep ranges, but an estimate, and it drifts badly past
 *                        ten reps (which is why the estimator refuses there).
 *   - `weight_for_reps` — the heaviest load moved for a given rep count. No
 *                        estimation involved: it happened.
 *   - `session_volume` — the most work done for an exercise in one session.
 *
 * A record is only claimed from a completed working set with real numbers.
 * Warm-ups, incomplete sets and sets logged without a load are never records —
 * a "PR" a user cannot recognise destroys trust in every other number.
 */

import { estimatedOneRepMax } from '../training/progression';
import type { IsoDate, PrKind, SetType } from '@/types/domain';

export interface RecordCandidateSet {
  id: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  isCompleted: boolean;
  performedOn: IsoDate;
}

export interface ExistingRecord {
  exerciseId: string;
  kind: PrKind;
  value: number;
  /** Only meaningful for `weight_for_reps`. */
  reps: number | null;
}

export interface DetectedRecord {
  exerciseId: string;
  kind: PrKind;
  value: number;
  reps: number | null;
  weightKg: number | null;
  achievedOn: IsoDate;
  exerciseSetId: string | null;
  /** Previous best, so the UI can say "up from 102.5 kg". */
  previousValue: number | null;
}

/** Set types that can produce a record. A warm-up never can. */
const RECORDABLE: ReadonlySet<SetType> = new Set<SetType>([
  'working',
  'backoff',
  'amrap',
]);

export function isRecordable(set: RecordCandidateSet): boolean {
  return (
    set.isCompleted &&
    RECORDABLE.has(set.setType) &&
    (set.weightKg ?? 0) > 0 &&
    (set.reps ?? 0) > 0
  );
}

function keyFor(exerciseId: string, kind: PrKind, reps: number | null): string {
  return `${exerciseId}::${kind}::${reps ?? 'any'}`;
}

/**
 * Find records in a batch of sets, given what the user already holds.
 *
 * Ties do not count. Matching a previous best is not a new record, and
 * announcing it as one would cheapen the ones that are real.
 */
export function detectPersonalRecords(
  sets: readonly RecordCandidateSet[],
  existing: readonly ExistingRecord[],
): DetectedRecord[] {
  const best = new Map<string, number>();
  for (const record of existing) {
    best.set(keyFor(record.exerciseId, record.kind, record.reps), record.value);
  }

  const detected = new Map<string, DetectedRecord>();
  const recordable = sets.filter(isRecordable);

  // --- Estimated 1RM and weight-for-reps, per set ------------------------
  for (const set of recordable) {
    const weightKg = set.weightKg as number;
    const reps = set.reps as number;

    const oneRm = estimatedOneRepMax(weightKg, reps);
    if (oneRm !== null) {
      considerRecord(detected, best, {
        exerciseId: set.exerciseId,
        kind: 'estimated_1rm',
        value: oneRm,
        reps,
        weightKg,
        achievedOn: set.performedOn,
        exerciseSetId: set.id,
      });
    }

    considerRecord(detected, best, {
      exerciseId: set.exerciseId,
      kind: 'weight_for_reps',
      value: weightKg,
      reps,
      weightKg,
      achievedOn: set.performedOn,
      exerciseSetId: set.id,
    });
  }

  // --- Session volume, per exercise --------------------------------------
  const volumeByExercise = new Map<string, { volume: number; date: IsoDate }>();
  for (const set of recordable) {
    const contribution = (set.weightKg as number) * (set.reps as number);
    const current = volumeByExercise.get(set.exerciseId);
    volumeByExercise.set(set.exerciseId, {
      volume: (current?.volume ?? 0) + contribution,
      date: set.performedOn,
    });
  }

  for (const [exerciseId, { volume, date }] of volumeByExercise) {
    considerRecord(detected, best, {
      exerciseId,
      kind: 'session_volume',
      value: round2(volume),
      reps: null,
      weightKg: null,
      achievedOn: date,
      exerciseSetId: null,
    });
  }

  return [...detected.values()].sort((a, b) => {
    if (a.exerciseId !== b.exerciseId) return a.exerciseId.localeCompare(b.exerciseId);
    return a.kind.localeCompare(b.kind);
  });
}

function considerRecord(
  detected: Map<string, DetectedRecord>,
  best: Map<string, number>,
  candidate: Omit<DetectedRecord, 'previousValue'>,
): void {
  const key = keyFor(candidate.exerciseId, candidate.kind, candidate.reps);
  const previous = best.get(key) ?? null;
  const alreadyDetected = detected.get(key);

  // Strictly greater: equalling a best is not a record.
  if (previous !== null && candidate.value <= previous) return;
  if (alreadyDetected && candidate.value <= alreadyDetected.value) return;

  detected.set(key, { ...candidate, previousValue: previous });
}

export const PR_KIND_LABELS: Record<PrKind, string> = {
  estimated_1rm: 'Estimated 1RM',
  weight_for_reps: 'Weight for reps',
  session_volume: 'Session volume',
};

/** How a record reads on screen, in the user's terms. */
export function describeRecord(record: DetectedRecord): string {
  switch (record.kind) {
    case 'estimated_1rm':
      return `${format(record.value)} kg estimated max, from ${format(record.weightKg ?? 0)} kg × ${record.reps}`;
    case 'weight_for_reps':
      return `${format(record.value)} kg × ${record.reps}`;
    case 'session_volume':
      return `${Math.round(record.value).toLocaleString('en-US')} kg total in one session`;
  }
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function format(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${round2(value)}`;
}
