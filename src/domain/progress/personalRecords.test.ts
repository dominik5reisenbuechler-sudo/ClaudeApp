import { describe, expect, it } from 'vitest';

import {
  describeRecord,
  detectPersonalRecords,
  isRecordable,
} from './personalRecords';
import type { ExistingRecord, RecordCandidateSet } from './personalRecords';

const set = (over: Partial<RecordCandidateSet> = {}): RecordCandidateSet => ({
  id: 'set-1',
  exerciseId: 'barbell_bench_press',
  weightKg: 100,
  reps: 5,
  setType: 'working',
  isCompleted: true,
  performedOn: '2025-06-16',
  ...over,
});

describe('isRecordable', () => {
  it('accepts a completed working set with real numbers', () => {
    expect(isRecordable(set())).toBe(true);
  });

  it('rejects warm-ups — a PR the user cannot recognise destroys trust', () => {
    expect(isRecordable(set({ setType: 'warmup' }))).toBe(false);
  });

  it('rejects incomplete sets and sets with no load or reps', () => {
    expect(isRecordable(set({ isCompleted: false }))).toBe(false);
    expect(isRecordable(set({ weightKg: null }))).toBe(false);
    expect(isRecordable(set({ reps: 0 }))).toBe(false);
  });
});

describe('detectPersonalRecords', () => {
  it('finds a first-ever record of each kind', () => {
    const records = detectPersonalRecords([set()], []);
    const kinds = records.map((record) => record.kind).sort();

    expect(kinds).toEqual(['estimated_1rm', 'session_volume', 'weight_for_reps']);
  });

  it('reports the previous best so the UI can say what it beat', () => {
    const existing: ExistingRecord[] = [
      { exerciseId: 'barbell_bench_press', kind: 'weight_for_reps', value: 95, reps: 5 },
    ];
    const record = detectPersonalRecords([set({ weightKg: 100 })], existing).find(
      (candidate) => candidate.kind === 'weight_for_reps',
    );

    expect(record?.value).toBe(100);
    expect(record?.previousValue).toBe(95);
  });

  it('does not claim a record for equalling a previous best', () => {
    const existing: ExistingRecord[] = [
      { exerciseId: 'barbell_bench_press', kind: 'weight_for_reps', value: 100, reps: 5 },
    ];
    const records = detectPersonalRecords([set({ weightKg: 100 })], existing);
    expect(records.map((record) => record.kind)).not.toContain('weight_for_reps');
  });

  it('tracks weight-for-reps separately per rep count', () => {
    // 100 × 5 is a record even when 90 × 8 is already held: different question.
    const existing: ExistingRecord[] = [
      { exerciseId: 'barbell_bench_press', kind: 'weight_for_reps', value: 90, reps: 8 },
    ];
    const records = detectPersonalRecords([set({ weightKg: 100, reps: 5 })], existing);
    const forReps = records.find((record) => record.kind === 'weight_for_reps');

    expect(forReps?.reps).toBe(5);
    expect(forReps?.previousValue).toBeNull();
  });

  it('keeps only the best set when several beat the record', () => {
    const records = detectPersonalRecords(
      [
        set({ id: 'a', weightKg: 100, reps: 5 }),
        set({ id: 'b', weightKg: 105, reps: 5 }),
        set({ id: 'c', weightKg: 102.5, reps: 5 }),
      ],
      [],
    );
    const forReps = records.filter((record) => record.kind === 'weight_for_reps');

    expect(forReps).toHaveLength(1);
    expect(forReps[0]?.value).toBe(105);
    expect(forReps[0]?.exerciseSetId).toBe('b');
  });

  it('sums session volume across the exercise\'s sets', () => {
    const records = detectPersonalRecords(
      [set({ id: 'a', weightKg: 100, reps: 5 }), set({ id: 'b', weightKg: 100, reps: 5 })],
      [],
    );
    const volume = records.find((record) => record.kind === 'session_volume');
    expect(volume?.value).toBe(1000);
  });

  it('excludes warm-ups from session volume', () => {
    const records = detectPersonalRecords(
      [
        set({ id: 'a', weightKg: 100, reps: 5 }),
        set({ id: 'b', weightKg: 60, reps: 10, setType: 'warmup' }),
      ],
      [],
    );
    expect(records.find((record) => record.kind === 'session_volume')?.value).toBe(500);
  });

  it('skips the 1RM estimate beyond ten reps but still records the load', () => {
    const records = detectPersonalRecords([set({ weightKg: 60, reps: 20 })], []);
    const kinds = records.map((record) => record.kind);

    expect(kinds).not.toContain('estimated_1rm');
    expect(kinds).toContain('weight_for_reps');
  });

  it('keeps records for different exercises apart', () => {
    const records = detectPersonalRecords(
      [set({ id: 'a' }), set({ id: 'b', exerciseId: 'back_squat', weightKg: 140 })],
      [],
    );
    expect(new Set(records.map((record) => record.exerciseId)).size).toBe(2);
  });

  it('finds nothing in an empty session', () => {
    expect(detectPersonalRecords([], [])).toEqual([]);
  });

  it('is deterministically ordered', () => {
    const sets = [set({ id: 'a' }), set({ id: 'b', exerciseId: 'back_squat', weightKg: 140 })];
    expect(detectPersonalRecords(sets, [])).toEqual(detectPersonalRecords(sets, []));
  });
});

describe('describeRecord', () => {
  it('reads naturally for each kind', () => {
    const records = detectPersonalRecords([set({ weightKg: 100, reps: 5 })], []);

    const oneRm = records.find((record) => record.kind === 'estimated_1rm');
    const forReps = records.find((record) => record.kind === 'weight_for_reps');
    const volume = records.find((record) => record.kind === 'session_volume');

    expect(describeRecord(oneRm as never)).toMatch(/estimated max/);
    expect(describeRecord(forReps as never)).toBe('100 kg × 5');
    expect(describeRecord(volume as never)).toMatch(/total in one session/);
  });
});
